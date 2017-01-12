'use strict';

const util = require('./util');
const debug = require('debug')('jm:lib:taskSeries');

class taskSeries {
  constructor(jm) {
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
    jm.task._queue.process(sid, (job, done) => {
      debug('execute process job.data: %o', job.data);
      if (!job.data.result && job.data.status === 'complete' && job.data.result) {
        debug('execute get an complete job with data: %o', job.data.result);
        return done(null, job.data.result);
      }
      try {
        let mod;
        if (!job.data.rewindFlg) {
          mod = jm.handlers.get(job.data.handler);
        } else {
          mod = jm.handlers.get(job.data.rewindHandler);
        }
        const input = job.data.preResult;
        debug('execute task input: %o', input);
        // todo: throw error when param is empty;
        const param = job.data.param || {};
        mod(JSON.parse(param), input, (err, res) => {
          if (err) {
            debug('execute with error: %o', err);
            return done(err);
          }
          done(null, res);
        });
      } catch (e) {
        done(e);
      }
    });

    return this.createStep(jm, sid, 0)
      .catch(err => {
        //TODO log err
        return this._processRewind(sid, err.index)
          .catch((e) => {
            debug('after rewind fail %s', e);
            throw e;
          })
          .then(() => {
            debug('after rewind sucess %s', err.message);
            throw err.message;
          });
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
              debug('createStep complete idx: %s \t result: %o', idx, result);
              jm.job._db
                .multi([
                  ['hset', `${sid}:${idx}`, 'status', 'complete'],
                  ['hset', `${sid}:${idx}`, 'result', JSON.stringify(result)],
                ])
                .exec()
                .then(() => {
                  return this.next(jm, sid, idx);
                })
                .then((nextTask) => {
                  resolve({ result, nextTask });
                })
                .catch(err => reject(err));
            })
            .on('failed', (errMessage) => {
              debug('createStep job failed');
              jm.job._db
                .multi([
                  ['hset', `${sid}:${idx}`, 'status', 'failed'],
                  ['hset', `${sid}:${idx}`, 'error', errMessage],
                ])
                .exec();
              return reject({ message: errMessage, index: idx });
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
          return this.createStep(jm, sid, +res.nextTask.idx, res.result); //cast idx to number
        }
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
          debug('next task: %o', task);
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
    debug('_processRewind sid: %s \t errIdx: %d \t ', sid, errIdx);
    let curIdx = errIdx;
    // init rewind tasks
    const multi = this.jm.job._db.multi();
    const rewindTasks = [];
    for (let idx = errIdx; idx >= 0; idx--) {
      rewindTasks.push(
        this.jm.job._db.hgetall(`${sid}:${idx}`)
          .then((task) => {
            debug('_processRewind task: %o', task);
            if (task.rewindHandler) {
              task.rewindFlg = true;
              task.idx = ++curIdx;
              return multi.hmset(`${sid}:${curIdx}`, task);
            }
          })
      );
    }

    return Promise.all(rewindTasks)
        .then(res => {
          debug('_processRewind finished setup rewind tasks');
          const tasks = res.filter((r) => !!r);
          if (tasks.length === 0) {
            debug('_processRewind no rewind task');
            return multi.exec();
          } else {
            // stop old task process
            multi.del(`${sid}:${curIdx + 1}`);
            return multi.exec()
              .then(() => {
                return errIdx > 0 && this.jm.job._db.hgetall(`${sid}:${errIdx - 1}`)
              })
              .then((task) => task && task.result && JSON.parse(task.result))
              .then((input) => this.createStep(this.jm, sid, errIdx + 1, input));
          }
        });
  }
}

module.exports = taskSeries;
