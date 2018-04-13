const expect = require('expect');
const uuid = require('uuid');
const delay = require('delay');
const JM = require('../../lib/jobManager');
const config = require('../fixture/config').sentinel;

describe('Integration', () => {
  it('execute tasks sequentially for on job type', () => {
    const jm = new JM(config);
    const uid = uuid.v4();
    const jobType = 'integratoin';
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
        retry: 5,
        path: '../test/fixture/task2',
        param: { baz: 'qux' },
      },
    ];
    return jm.addJob(jobType, { id: uid }, tasks)
      .then(() => {
        return jm.run(jobType);
      })
      .then((res) => {
        expect(res).toEqual(`integratoin:${uid}`);
        return delay(1000);
      })
      .then(() => {
        return jm.job._db.get(`${jobType}:id:${uid}`);
      })
      .then((val) => {
        expect(val).toEqual('barqux');
      });
  });

  it('should stop execute when one of the task is failure ', () => {
    const jm = new JM(config);
    const uid = uuid.v4();
    const jobType = 'integratoin2';
    const tasks = [
      {
        name: 'ipsum',
        ttl: 5000,
        retry: 1,
        path: '../test/fixture/task1',
        param: { foo: 'bar' },
      },
      {
        name: 'failure',
        ttl: 5000,
        retry: 1,
        path: '../test/fixture/failTask',
        param: { baz: 'qux' },
      },
      {
        name: 'lorem',
        ttl: 10000,
        retry: 1,
        path: '../test/fixture/task2',
        param: { baz: 'qux' },
      },
    ];
    return jm.addJob(jobType, { id: uid }, tasks)
      .then(() => {
        return jm.run(jobType);
      })
      .then((res) => {
        expect(res).toEqual(`${jobType}:${uid}`);
        return delay(1000);
      })
      .then(() => {
        return jm.job._db.get(`${jobType}:id:${uid}`);
      })
      .then((val) => {
        expect(val).toBeA('string');
      });
  });

  it('should do some rewind task if one failure ', () => {
    const jm = new JM(config);
    const uid = uuid.v4();
    const jobType = 'integratoin3';
    const tasks = [
      {
        name: 'failure',
        ttl: 5000,
        retry: 1,
        path: '../test/fixture/failTask',
        rewindPath: '../test/fixture/rewindTask',
        param: { baz: 'qux' },
      },
      {
        name: 'ipsum',
        ttl: 5000,
        retry: 1,
        path: '../test/fixture/task1',
        param: { foo: 'bar' },
      },
      {
        name: 'lorem',
        ttl: 10000,
        retry: 1,
        path: '../test/fixture/task2',
        param: { baz: 'qux' },
      },
    ];
    return jm.addJob(jobType, { id: uid }, tasks)
      .then(() => {
        return jm.run(jobType);
      })
      .then((res) => {
        expect(res).toEqual(`${jobType}:${uid}`);
        return delay(1000);
      })
      .then(() => {
        return jm.job._db.get(`${jobType}:id:${uid}`);
      })
      .then((val) => {
        expect(val).toBeA('string');
      });
  });
});
