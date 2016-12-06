'use strict';

const expect = require('expect');
const redisFactory = require('../../lib/redisFactory');
const { normal, sentinel } = require('../fixture/config');

describe('Redis Factory', () => {
  describe('#JOB', () => {
    it('return a configured job queue instance with normal redis', () => {
      const job = redisFactory.job(normal);
      expect(job).toBeAn('object');
      expect(job.status).toEqual('connecting');
    });
    it('return a configured job queue instance with sentinel redis', () => {
      const job = redisFactory.job(sentinel);
      expect(job).toBeAn('object');
      expect(job.status).toEqual('connecting');
    });
  });

  describe('task', () => {
    it('return a configured task queue instance with normal redis', () => {
      const task = redisFactory.task(normal);
      expect(task).toBeAn('object');
      expect(task.workers).toBeAn('array');
    });
    it('return a configured task queue instance with sentinel redis', () => {
      const task = redisFactory.task(sentinel);
      expect(task).toBeAn('object');
      expect(task.workers).toBeAn('array');
    });
  });
});
