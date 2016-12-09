'use strict';

const delay = require('delay');
const util = require('./util');
const debug = require('debug')('jm:lib:taskSeries');

class taskSeries {
  constructor(jm) {
    this.sid = '';
    this.jm = jm;
  }

  /**
   * execute tasks
   * @param {jobManager} jm
   * @param {string} job unique id
   * @return
   */
  execute(jm, sid) {
    debug('execute tasks sid: %s \t', sid);
    this.sid = sid;
    return new Promise((resolve, reject) => {
      jm.task._queue.process(sid, (job, done) => {
        debug('execute process job.data: %o', job.data);
        if (job.data.status === 'complete' && job.data.result) {
          debug('execute get an complete job with data: %o', job.data.result);
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
          // todo: throw error when param is empty;
          const param = job.data.param || {};
          mod(JSON.parse(param), input, (err, res) => {
            if (err) {
              debug('execute with error: %o', err);
              // init compensate tasks
              this._processRewind(sid, Number(job.data.idx));
              // for (let i = Number(job.data.idx); i >= 0; i--) {
              //   if (tasks[i].rewindPath) {
              //     this.compensateTasks.push(tasks[i]);
              //   }
              // }
              // if (this.compensateTasks.length > 0) {
              //   const multi = jm.job._db.multi();
              //   this.compensateTasks.forEach((task, i) => {
              //     const idx = Number(job.data.idx) + i + 1;
              //     task.idx = idx;
              //     task.rewindFlg = true;
              //     task.preResult = res;
              //     multi.hmset(`${sid}:${idx}`, util.serialize(task));
              //   });
              //   multi.exec()
              //     .then(() => {
              //       // async call
              //       debug('execute error with res: %o', res);
              //       // this.execute(jm, sid);
              //     });
              // }
              return done(err);
            }
            // this.jm.clean();
            done(null, res);
          });
        } catch (e) {
          done(e);
        }
      });
      return this.createStep(jm, sid, 0)
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

  createStep(jm, sid, idx, preResult) {
    debug('createStep sid: %s \t idx: %d \t preResult: %o', sid, idx, preResult);
    return new Promise((resolve, reject) => {
      jm.job._db.hgetall(`${sid}:${idx}`)
        .then((task) => {
          if (preResult) {
            task.preResult = preResult;
          }
          debug('createStep get task: %o', task);
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
                  ['hset', `${sid}:${idx}`, 'status', 'complete'],
                  ['hset', `${sid}:${idx}`, 'result', result],
                ])
                .exec()
                .then(() => {
                  return this.next(jm, sid, idx);
                })
                .then((nextTask) => {
                  resolve({ result, nextTask });
                })
                .then()
                .catch(err => reject(err));
            })
            .on('failed', (errMessage) => {
              debug('createStep job failed');
              jm.job._db
                .multi([
                  ['hset', `${sid}:${task.idx}`, 'status', 'failed'],
                  ['hset', `${sid}:${task.idx}`, 'error', errMessage],
                ])
                .exec();
              return reject(errMessage);
            })
            .save((err) => {
              if (err) {
                return reject(err);
              }
              debug('createStep job saved');
            });
        });
    })
      .then((res) => {
        debug('createStep nextTask %o \t result: %o', res.nextTask, res.result);
        if (res.nextTask.idx) {
          return this.createStep(jm, sid, res.nextTask.idx, res.result);
        }
        // for (let i = task.idx; i >= 0; i--) {
        //   jm.job._db.del(`${this.sid}:${i}`);
        // }
        return res.result;
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
    debug('next sid: %s \t curIdx: %d', sid, curIdx);
    return new Promise((resolve, reject) => {
      jm.job._db.hgetall(`${sid}:${++curIdx}`)
        .then((task) => {
          resolve(util.deserialize(task));
        })
        .catch(err => reject(err));
    });
  }

  /**
   *
   * @param sid
   * @param errIdx
   * @returns {Promise}
   * @private
   */
  _processRewind(sid, errIdx) {
    debug('_processRewind sid: %s \t redIdx: %d', sid, errIdx);
    let curIdx = errIdx;
    // init rewind tasks
    const multi = this.jm.job._db.multi();
    const rewindTasks = [];
    return new Promise((resolve, reject) => {

      for (let redIdx = errIdx; redIdx >= 0; redIdx--) {
        rewindTasks.push(
          this.jm.job._db.hgetall(`${sid}:${redIdx}`)
            .then((task) => {
              debug('task: %o', task);
              // todo: set rewindFlg to true
              if (task.rewindPath) {
                task.rewindFlg = true;
                return multi.hmset(`${sid}:${++curIdx}`, task);
              }
              return Promise.resolve();
            })
        );
      }
      // todo: dealy for now, in case to clear the workflow
      delay(100)
        .then(() => Promise.all(rewindTasks))
        .then(res => {
          debug('res: %o', res);
          debug('_processRewind finished setup rewind tasks');
          const tasks = res.filter((r) => !!r);
          if (tasks.length === 0) {
            debug('_processRewind no rewind task');
            return resolve(multi.exec());
          } else {
            // stop old task process
            multi.del(`${sid}:${curIdx + 1}`);
            return multi.exec()
              .then(() => resolve(this.createStep(this.jm, sid, errIdx + 1)));
          }
        })
        .catch((err) => reject(err));
    });
  }
}

module.exports = taskSeries;
