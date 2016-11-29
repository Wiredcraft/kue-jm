'use strict';

const expect = require('expect');
const uuid = require('uuid');
const delay = require('delay');
const sinon = require('sinon');
// const testQ = require('kue').createQueue();
const JM = require('../../lib/jobManager');
const Series = require('../../lib/taskSeries');
const config = require('../configWithSentinel');
const mockConsumer = require('../fixture/consumer');

describe('Job Manager', () => {
  let jm;

  beforeEach(() => {
    jm = new JM(config);
    expect(jm.job).toBeAn('object');
    expect(jm.task._queue).toBeAn('object');
    // testQ.testMode.enter();
    // jm.task._queue = testQ;
  });

  afterEach(() => {
    // testQ.testMode.clear();
    return jm.job._db.flushdb();
  });

  // after(() => {
  //   testQ.testMode.exit();
  // });

  describe('#ADDJOB ', () => {
    context.skip('with right options', () => {
      it('should return a correct job object with giving id', () => {
        const uid = uuid.v4();
        let jobId;
        return jm.addJob('foo', { id: uid }, [])
          .then((res) => {
            expect(res).toBeAn('object');
            expect(res.id).toBeA('number');
            expect(res.data.id).toEqual(uid);
            expect(res.type).toEqual('foo');
            jobId = res.id;
            return jm.job._db.get(`foo:id:${uid}`);
          })
          .then((value) => {
            expect(value).toEqual(jobId);
            mockConsumer(jm.task._queue, 'foo');
            return delay(100);
          })
          .then(() => jm.job._db.get(`foo:id:${uid}`))
          .then((value) => {
            expect(value).toEqual('pong');
          });
      });
    });

    context('with wrong options', () => {
      it('throw an error when options is not enough', () => {
        expect(() => jm.addJob()).toThrow(Error);
      });

      it('throw an error when options type is not a string', () => {
        expect(() => jm.addJob({ foo: 'bar' })).toThrow(Error);
      });

      it('throw an error when data do not have unique id field', () => {
        expect(() => jm.addJob('foo', { message: 'test message' })).toThrow(Error);
      });
    });
  });

  describe.skip('#ADDTASKS ', () => {
    const jobType = 'ADDTASKS';

    beforeEach(() => {
      return jm.addJob(jobType, { id: uuid.v4() });
    });

    context('with right options', () => {
      it('should add tasks to the JM ', () => {
        const tasks = [{ name: 'task1' }];
        jm.addTasks(jobType, tasks);
        expect(jm.task.collections.get(jobType)).toEqual(tasks);
      });
    });

    context('with wrong options', () => {
      it('throw an error when options is not enough', () => {
        expect(() => jm.addTasks()).toThrow(Error);
      });

      it('throw an error when job type not exists', () => {
        const tasks = [{ name: 'task1' }];
        expect(() => jm.addTasks('notExist', tasks)).toThrow(Error);
      });
    });
  });

  describe('#GETTASKSTATUS', () => {
    afterEach(() => {
      return jm.job._db.flushdb();
    });

    it('should not store task info if it was completed', () => {
      const jobType = 'GETTASKSTATUS1';
      const tasks = [
        {
          name: 'ipsum',
          ttl: 5000,
          retry: 4,
          path: '../test/fixture/task1',
          param: { foo: 'bar' },
        },
        {
          name: 'lorem',
          ttl: 10000,
          retry: 2,
          path: '../test/fixture/task2',
          param: { baz: 'qux' },
        },
      ];
      const id = uuid.v4();
      return jm.addJob(jobType, { id }, tasks)
        .then(() => jm.run(jobType))
        .then(() => delay(1000))
        .then(() => jm.getTaskStatus(jobType, id))
        .then((ret) => {
          // for task which completed successfully
          // the infomation will be removed from redis `jm.job._db`
          expect(Object.keys(ret[0]).length).toEqual(0);
          expect(Object.keys(ret[1]).length).toEqual(0);
        });
    });

    it('should store task error info if it was failed', () => {
      const jobType = 'GETTASKSTATUS2';
      const tasks = [
        {
          name: 'ipsum',
          ttl: 5000,
          retry: 4,
          path: '../test/fixture/task1',
          param: { foo: 'bar' },
        },
        {
          name: 'lorem',
          ttl: 10000,
          retry: 2,
          path: '../test/fixture/exceptionTask1',
          param: { baz: 'qux' },
        },
        {
          name: 'ipsum',
          ttl: 5000,
          retry: 4,
          path: '../test/fixture/task2',
          param: { foo: 'bar' },
        },
      ];
      const id = uuid.v4();
      return jm.addJob(jobType, { id }, tasks)
        .then(() => jm.run(jobType))
        .then(() => delay(1000))
        .then(() => jm.getTaskStatus(jobType, id))
        .then((ret) => {
          expect(ret[0].status).toEqual('complete');
          expect(ret[0].result).toEqual('bar');
          expect(ret[1].status).toEqual('failed');
          expect(ret[1].error).toEqual('This is an error message');
          // prop `status` will not be added if the task was not being executed
          expect(ret[2].status).toEqual(undefined);
        });
    });
  });

  describe.skip('#LISTTASKS ', () => {
  });

  describe.skip('#REMOVETASK ', () => {

  });

  describe.skip('#RUN ', () => {
    const jobType = 'RUN';
    let tasks;
    beforeEach(() => {
      tasks = [
        {
          name: 'ipsum',
          ttl: 5000,
          retry: 4,
          path: '../test/fixture/task1',
          param: { foo: 'bar' },
        },
        {
          name: 'lorem',
          ttl: 10000,
          retry: 5,
          path: '../test/fixture/task2',
          param: { baz: 'qux' },
        },
      ];
      return jm.addJob(jobType, { id: uuid.v4() });
    });

    it('throw error when job type not exists', () => {
      return jm.run('notExist')
        .catch((err) => {
          expect(err).toExist();
        });
    });

    context('process with different task number', () => {
      it('should return null with zero task', () => {
        tasks.length = 0;
        jm.addTasks(jobType, tasks);
        return jm.run(jobType)
          .then((res) => {
            expect(res).toEqual(null);
          })
          .catch(err => expect(err).toNotExist());
      });

      it('should return process result with one task', () => {
        sinon.stub(Series.prototype, 'execute').returns(Promise.resolve('pong'));
        tasks.length = 1;
        // todo: do not know why i must create new job type here, then pass the test case.
        const jobType = 'RUN2';
        let sid;
        return jm.addJob(jobType, { id: uuid.v4() })
          .then(() => {
            jm.addTasks(jobType, tasks);
            return jm.run(jobType);
          })
          .then((res) => {
            expect(res).toBeA('string');
            expect(res.length).toEqual(36);
            sid = res;
            return delay(100);
          })
          .then(() => {
            return jm.job._db.get(`${jobType}:id:${sid}`);
          })
          .then((value) => {
            expect(value).toEqual('pong');
            Series.prototype.execute.restore();
          })
          .catch(err => expect(err).toNotExist());
      });
    });
  });
});
