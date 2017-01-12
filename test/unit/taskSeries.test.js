'use strict';

const expect = require('expect');
const sinon = require('sinon');
const uuid = require('uuid');
const delay = require('delay');
const JM = require('../../lib/jobManager');
const Series = require('../../lib/taskSeries');
const config = require('../fixture/config').normal;

describe('Task series', () => {
  let jm;
  let series;

  before(() => {
    // todo: mock this.
    jm = new JM(config);
    series = new Series(jm);
  });

  describe('#EXECUTETASKS', () => {
    let tasks = [
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
      }];
    let sandbox;
    let sid;
    let i = 0;

    // beforeEach(() => {
    //   sandbox = sinon.sandbox.create();
    //   sandbox.stub(Series.prototype, 'execute').returns(Promise.resolve(true));
    //   const jobType = `EXECUTETASKS${i}`;
    //   const id = uuid.v4();
    //   sid = `${jobType}:${id}`;
    //   return jm.addJob(jobType, { id }, tasks)
    //     .then(() => {
    //       return jm.run(jobType);
    //     })
    //     .then(() => {
    //       i++;
    //       return sandbox.restore();
    //     });
    // });
    //
    afterEach(() => jm.job._db.flushdb());

    it('should execute the tasks sequentially', () => {
      return series.execute(jm, sid)
        .then(res => expect(res).toEqual('barqux'));
    });

    it('should record complete status and the result', () => {
      tasks.push({
        name: 'lorem',
        path: '../test/fixture/non-exist',
        param: { baz: 'qux' },
      });
      return series.execute(jm, sid)
        .catch((err) => {
          expect(err).toExist();
          jm.job._db.keys('*:?', (err, replies) => {
            expect(replies.length).toEqual(2);
            const t1 = replies.find(reply => (/.*:0$/.test(reply)));
            jm.job._db.hgetall(t1, (err, t) => {
              expect(t.name).toEqual('ipsum');
              expect(t.param).toEqual('{"foo":"bar"}');
              expect(t.result).toEqual('bar');
              expect(t.status).toEqual('complete');
            });
          });
        });
    });

    it('should stop execute when one of the task is failure', () => {
      tasks = [
        {
          name: 'failure1',
          ttl: 5000,
          retry: 4,
          path: '../test/fixture/failTask',
          param: { foo: 'bar' },
          rewind: {
            path: '../test/fixture/rewindTask',
          },
        },
        {
          name: 'lorem',
          ttl: 10000,
          retry: 5,
          path: '../test/fixture/task2',
          param: { baz: 'qux' },
        },
      ];

      return series.execute(jm, sid)
        .catch((err) => {
          expect(err).toExist();
        });
    });

    it('should execute rewind tasks when some error happened', () => {
      tasks = [
        {
          name: 'failure1',
          ttl: 5000,
          retry: 4,
          path: '../test/fixture/failTask',
          param: { foo: 'bar' },
          rewind: {
            path: '../test/fixture/rewindTask'
          }
        }
      ];
      const jobType = `EXECUTETASKS0`;
      const id = uuid.v4();
      sid = `${jobType}:${id}`;
      return jm.addJob(jobType, { id }, tasks)
        .then(() => delay(100))
        .then(() => expect(true).toEqual('true'));
      // return series.execute(jm, sid, { rewind: true })
      //   .then(res => {
      //     expect(res).toEqual('-bar');
      //   })
    });
  });
});
