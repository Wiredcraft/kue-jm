module.exports = (param, previousResult, callback) => {
  setTimeout(() => {
    callback(null, `-${param.foo}`);
  }, 50);
};
