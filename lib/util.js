'use strict';

const _ = require('lodash');
/**
 * serialize task
 * @param {Object} task
 * @return
 */
exports.serialize = function serialize(json) {
  return _.mapValues(json, (v) => {
    return _.isObject(v) ? JSON.stringify(v) : v;
  });
};

exports.deserialize = function deserialize(flatTask) {
  const result = _.mapValues(flatTask, (v, k) => {
    if (k === 'param' || k === 'result') {
      return JSON.parse(v);
    }
    return v;
  });
  return result;
};
