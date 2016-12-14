'use strict';

const EventEmitter = require('events');
const util = require('./util');
const redisFactory = require('./redisFactory');
const TaskSeries = require('./taskSeries');
const debug = require('debug')('jm:lib:jobmanager');

class JobManager extends EventEmitter {

  constructor(opt) {
    super();
    opt = opt || {};
    this.job = { _db: redisFactory.job(opt) };
    this.task = { _queue: redisFactory.task(opt), collections: new Map() };
    this.debug = opt.debug || false;
  }

  /**
   * Add a job to the job manager.
   * @param {String} job type
   * @param {Object} job data
   * @param {Object} options
   * @return added job instance
   */
  addJob(type, data, tasks, opt) {
    debug('addJob type: %s \t data: %o \t tasks: %o \t opt: %o', type, data, tasks, opt);
    if (!type || typeof type !== 'string') {
      throw new Error('please pass correct param');
    }
    opt = opt || {};
    const uniqField = opt.uniqField || 'id';
    if (!data[uniqField]) {
      throw Error(`data[${uniqField}] can not be empty.`);
    }
    const key = `${type}:${uniqField}:${data[uniqField]}`;
    const jobTTL = opt.jobTTL || 1000 * 60 * 5;
    const resultTTL = opt.resultTTL || 3600 * 24 * 3;
    const jobDb = this.job._db;
    return jobDb.set(key, 'init')
      .then(() => {
        debug('addJob set key: %s', key);
        data.tasks = tasks;
        const task = this.task._queue
          .create(type, data)
          .removeOnComplete(!this.debug)
          .ttl(jobTTL);
        task
          .on('complete', (result) => {
            debug('addJob complete result: %o', result);
            this.emit('complete', result);
            if (typeof result === 'object') {
              result = JSON.stringify(result);
            }
            if (resultTTL < 0) {
              jobDb.set(key, result);
            } else {
              jobDb.setex(key, resultTTL, result);
            }
          })
          .on('failed', (errorMsg) => {
            debug('addJob job error: %s', errorMsg);
            this.emit('failed', errorMsg);
          })
          .save((err) => {
            if (err) {
              jobDb.del(key);
              return Promise.reject(new Error('save job error.'));
            }
            debug('addJob save job key: %s \t job id: %s', key, task.id);
            jobDb.set(key, task.id);
            // TODO: better not have this set op.
            debug('addJob resolve job.id: %o', task.id);
            return Promise.resolve(true);
          });
      });
  }

  /**
   * Get status of tasks relate to a specific job
   * If those taks completed, an array of empty objects will be resolved
   * If one of the tasks failed, an array of task infomatiexecute
   * @param {string} uniqFiledValue
   * @return {promise} a promise resolved to an array
   */
  getTaskStatus(jobType, uniqFieldValue) {
    const num = this.listTasks(jobType).length;
    const statusPromises = [];
    for (let i = 0; i < num; i++) {
      const status = this.job._db
        .hgetall(`${jobType}:${uniqFieldValue}:${i}`);
      statusPromises.push(status);
    }
    return Promise.all(statusPromises);
  }

  /**
   * List tasks for the job type.
   * @param {string} job type.
   * @return
   */

  listTasks(jobType) {
    debug('getTasks jobType: %s', jobType);
    if (!jobType || typeof jobType !== 'string') {
      throw new Error('please pass correct param');
    }
    return this.job._db.get(`jobs:${jobType}`);
  }

  /**
   * Remove task for the job type.
   * @param {string} job type
   * @param {string} task name
   * @return
   */

  removeTask(jobType, taskName) {
    throw new Error(`please implement this for ${taskName}`);
  }

  /**
   * watchStuckJobs.
   * @param {Number} interval
   * @return
   */
  watchStuckJobs(interval) {
    interval = interval || 1000;
    const orgPrefix = this.task._queue.client.prefix;
    this.task._queue.client.prefix = 'q';
    this.task._queue.watchStuckJobs(interval);
    this.task._queue.client.prefix = orgPrefix;
  }

  /**
   * Run one job.
   * @param {string} job type
   * @param {number} concurrency
   * @return {string} job uuid
   */
  run(type, concurrency = 1) {
    debug('run type: %s \t concurrency: %s', type, concurrency);
    return new Promise((resolve, reject) => {
      if (!type || typeof type !== 'string') {
        return reject(new Error('please pass correct param'));
      }
      this.task._queue.process(type, concurrency, (job, done) => {
        const series = new TaskSeries(this);
        const tasks = job.data.tasks;
        if (!tasks || tasks.length === 0) {
          done(null, null);
          return resolve();
        }
        const multi = this.job._db.multi();
        const sid = `${type}:${job.data.id}`;
        debug('run with sid: %o', sid);
        tasks.forEach((task, i) => {
          tasks[i].idx = i;
          multi.hmset(`${sid}:${i}`, util.serialize(task));
        });
        multi.exec((err) => {
          if (err) {
            return reject(err);
          }
          // TODO: blocking queue processing have bad pref, should change it.
          series.execute(this, sid)
            .then((res) => {
              debug('execute res %o', res);
              this.cleanWorker(sid);
              done(null, res);
            })
            .catch((err) => {
              debug('execute err: %o', err);
              done(err);
            });
          resolve(sid);
        });
      });
    });
  }

  cloneJob() {
    throw new Error('this API is not implement yet');
  }

  toJSON() {
    throw new Error('this API is not implement yet');
  }

  /**
   * clean finished worker.
   */
  cleanWorker(type) {
    debug('cleanWork type: %s', type);
    if (this.task._queue.workers) {
      const idx = this.task._queue.workers.findIndex(worker => worker && worker.type === type);
      if (idx !== -1) {
        this.task._queue.workers[idx] = undefined;
      }
    }
  }
}

module.exports = JobManager;
