'use strict';

const util = require('./util');
const debug = require('debug')('jm:lib:taskSeries');

class taskSeries {
  constructor() {
    this.sid = '';
    this.compensateTasks = [];
  }

  /**
   * execute tasks
   * @param {jobManager} jm
   * @param {string} job unique id
   * @param {...tasks} task list
   * @return
   */
  execute(jm, sid, tasks) {
    debug('execute tasks sid: %s \t tasks: %o \t', sid, tasks);
    this.sid = sid;
    return new Promise((resolve, reject) => {
      if (!(tasks instanceof Array)) {
        return reject(new Error('No task to be executed.'));
      }
      if (tasks.length === 0) {
        return resolve({});
      }
      jm.task._queue.process(sid, (job, done) => {
        debug('executeTasks process job.data: %o', job.data);
        if (job.data.status === 'complete' && job.data.result) {
          debug('executeTasks get an complete job with data: %o', job.data.result);
          return done(null, job.data.result);
        }
        try {
          let mod;
          if (!job.data.rewindFlg) {
            mod = require(job.data.path);
          } else {
            mod = require(job.data.rewindPath);
          }
          const input = job.data.preResult;
          debug('execute task input: %o', input);
          mod(job.data.param, input, (err, res) => {
            if (err) {
              for (let i = Number(job.data.idx); i >= 0; i--) {
                if (tasks[i].rewindPath) {
                  this.compensateTasks.push(tasks[i]);
                }
              }
              if (this.compensateTasks.length > 0) {
                debug('execute error, this.compensateTasks.length: %d', this.compensateTasks.length);
                const multi = jm.job._db.multi();
                this.compensateTasks.forEach((task, i) => {
                  const idx = Number(job.data.idx) + i + 1;
                  task.idx = idx;
                  task.rewindFlg = true;
                  task.preResult = res;
                  multi.hmset(`${sid}:${idx}`, util.serialize(task));
                });
                multi.exec()
                  .then(() => {
                    // async call
                    debug('execute error with res: %o', res);
                    this.execute(jm, sid, this.compensateTasks);
                  });
              }
              done(err);
            } else {
              done(null, res);
            }
          });
        } catch (e) {
          done(e);
        }
      });
      return this.createStep(jm, sid, tasks[0])
        .then(res => resolve(res))
        .catch(err => reject(err));
    });
  }

  /**
   * create steps
   * @param {jobManager} jm
   * @param {task} task
   * @param {callback] cb
   * @return
   */

  createStep(jm, sid, task) {
    debug('createStep sid: %o \t task: %o', sid, task);
    return new Promise((resolve, reject) => {
      const job = jm.task._queue
        .create(sid, task)
        .removeOnComplete(!jm.debug)
        .attempts(task.retry)
        .ttl(task.ttl);
      job
        .on('complete', (result) => {
          debug('createStep complete result: %o', result);
          jm.job._db
            .multi([
              ['hset', `${sid}:${task.idx}`, 'status', 'complete'],
              ['hset', `${sid}:${task.idx}`, 'result', result],
            ])
            .exec()
            .then(() => {
              return this.next(jm, sid, task.idx);
            })
            .then((nextTask) => {
              resolve({ result, nextTask });
            })
            .then()
            .catch(err => reject(err));
        })
        .on('failed', (errMessage) => {
          jm.job._db
            .multi([
              ['hset', `${sid}:${task.idx}`, 'status', 'failed'],
              ['hset', `${sid}:${task.idx}`, 'error', errMessage],
            ])
            .exec();
          return reject(errMessage);
          // return cb(new Error(errMessage), null);
        })
        .save((err) => {
          if (err) {
            return reject(err);
          }
          debug('job saved');
        });
    })
      .then((res) => {
        const nextTask = res.nextTask;
        const result = res.result;
        debug('nextTask %o \t result: %o', nextTask, result);
        if (nextTask.idx) {
          nextTask.preResult = result;
          return this.createStep(jm, sid, nextTask);
        }
        for (let i = task.idx; i >= 0; i--) {
          jm.job._db.del(`${this.sid}:${i}`);
        }
        return result;
      });
  }

  /**
   * next step
   * @param {jobmanager} jm
   * @param {sid} job unique id
   * @param {curIdx} current step id
   * @return
   */
  next(jm, sid, curIdx) {
    debug('next curIdx: %d', curIdx);
    return new Promise((resolve, reject) => {
      jm.job._db.hgetall(`${sid}:${++curIdx}`)
        .then((task) => {
          resolve(util.deserialize(task));
        })
        .catch(err => reject(err));
    });
  }
}

module.exports = taskSeries;
