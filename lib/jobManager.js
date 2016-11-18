'use strict';

const EventEmitter = require('events').EventEmitter;
const util = require('./util');
const redisFactory = require('./redisFactory');
const TaskSeries = require('./taskSeries');
const debug = require('debug')('jm:lib:jobmanager');

class JobManager extends EventEmitter {

  constructor(opt) {
    super();
    opt = opt || {};
    this.job = { _db: redisFactory.job(opt), collections: new Map() };
    this.task = { _queue: redisFactory.task(opt), collections: new Map() };
    this.debug = opt.debug || false;
  }

  /**
   * Add a job to the job manager.
   * @param {String} job type
   * @param {Object} job data
   * @param {Object} options
   * @return
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

    return new Promise((resolve, reject) => {
      // TODO: this step may remove if there is some pref consider.
      jobDb.set(key, '')
        .then(() => {
          debug('addJob set key: %s', key);
          if (this.job.collections.get(type) === undefined) {
            this.job.collections.set(type, '');
          }
          data.tasks = this.addTasks(type, tasks);
          const job = this.task._queue
            .create(type, data)
            .removeOnComplete(!this.debug)
            .ttl(jobTTL);
          debug('addJob complete create kue job');
          job
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
                return reject(new Error('save job error.'));
              }
              debug('addJob save job key: %s \t job id: %s', key, job.id);
              jobDb.set(key, job.id);
              // TODO: better not have this set op.
              debug('resolve job.id: %o', job.id);
              resolve(this);
            });
        })
        .catch(err => reject(err));
    });
  }

  /**
   * Append tasks to the job type.
   * @param {string} job type.
   * @param {...tasks} task list.
   * @return
   */

  addTasks(jobType, newTasks) {
    debug('addTasks jobType: %s \t newTasks: %o', jobType, newTasks);
    if (!jobType || typeof jobType !== 'string') {
      throw new Error('please pass correct param');
    }
    if (this.job.collections.get(jobType) === undefined) {
      throw new Error('wrong job type.');
    }
    if (!(newTasks instanceof Array)) {
      throw new Error('tasks should be an array.');
    }
    if (this.task.collections) {
      const tasks = this.task.collections.get(jobType);
      if (tasks) {
        debug('addTasks find tasks: %o', tasks);
        this.task.collections.set(jobType, tasks.concat(newTasks));
      }
      this.task.collections.set(jobType, newTasks);
      return this.task.collections.get(jobType);
    }
    throw new Error('JM instance not setup well.');
  }

  /**
   * List tasks for the job type.
   * @param {string} job type.
   * @return
   */

  listTasks(jobType) {
    return this.task.collections.get(jobType);
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
    interval = interval || 1000 * 60;
    const orgPrefix = this.task._queue.client.prefix;
    this.task._queue.client.prefix = 'q';
    this.task._queue.watchStuckJobs(interval);
    this.task._queue.client.prefix = orgPrefix;
  }

  /**
   * Run one job with several tasks.
   * @param {string} job type
   * @param {number} concurrency
   * @return {string} job uuid
   */
  run(type, concurrency) {
    debug('run type: %s \t concurrency: %s', type, concurrency);
    concurrency = concurrency || 1;

    return new Promise((resolve, reject) => {
      if (!type || typeof type !== 'string') {
        return reject(new Error('please pass correct param'));
      }
      // if (this.job.collections.get(type) === undefined)
      //   return resolve();
      this.task._queue.process(type, concurrency, (job, done) => {
        const series = new TaskSeries();
        // const tasks = this.task.collections.get(type);
        const tasks = job.data.tasks;
        debug('run with tasks: %o', tasks);
        if (!tasks || tasks.length === 0) {
          done(null, null);
          return resolve();
        }
        const multi = this.job._db.multi();
        const sid = job.data.id;
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
          series.execute(this, sid, tasks)
            .then((res) => {
              debug('execute res %o', res);
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

  clean() {
    throw new Error('this API is not implement yet');
  }
}

module.exports = JobManager;
