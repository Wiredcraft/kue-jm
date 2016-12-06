'use strict';

exports.normal = {
  type: 'normal',
  redisHost: '127.0.0.1',
  redisPort: 6379,
  redisDBForJob: 1,
  redisDBForTask: 0,
  debug: false,
};

exports.sentinel = {
  type: 'sentinel',
  redisSentinelForJob: '127.0.0.1:26379',
  redisSentinelNameForJob: 'jobqueue01',
  redisDBForTask: 0,
  redisDBForJob: 1,
  debug: false,
};
