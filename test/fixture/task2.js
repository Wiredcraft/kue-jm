module.exports = (param, previousResult, callback) => {
  setTimeout(() => {
    callback(null, previousResult + JSON.parse(param).baz);
  }, 10);
};
