module.exports = (param, previousResult, callback) => {
  setTimeout(() => {
    callback(null, previousResult + param.baz);
  }, 10);
};
