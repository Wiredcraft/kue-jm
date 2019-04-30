'use strict';

const Redis = require('ioredis');
const kue = require('kue');
const debug = require('debug')('jm:lib:redisFactory');

const getSentinels = (sentinelsString) => {
  debug('sentinelsString: %o', sentinelsString);
  return sentinelsString.split(',').map((each) => {
    return {
      host: each.split(':')[0],
      port: each.split(':')[1],
    };
  });
};

exports.job = (opt) => {
  debug('job opt: %o ', opt);
  let redis;
  if (opt.type === 'sentinel') {
    redis = new Redis({
      sentinels: getSentinels(opt.redisSentinelForJob),
      name: opt.redisSentinelNameForJob,
      password: opt.redisPassword
    });
  } else {
    redis = new Redis({
      password: opt.redisPassword
    });
  }
  redis.select(opt.redisDBForJob || 1);
  return redis;
};

exports.task = (opt) => {
  const queue = kue.createQueue({
    prefix: opt.prefix || 'q',
    redis: {
      createClientFactory: () => {
        if (opt.type === 'sentinel') {
          return new Redis({
            sentinels: getSentinels(opt.redisSentinelForJob),
            name: opt.redisSentinelNameForJob,
            db: opt.redisDBForTask || 0,
            password: opt.redisPassword
          });
        }
        return new Redis({
          db: opt.redisDBForTask || 0,
          password: opt.redisPassword
        });
      },
    },
  });
  queue.setMaxListeners(queue.getMaxListeners() + 1);
  return queue;
};
