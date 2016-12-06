module.exports = (param, previousResult, callback) => {
  setTimeout(() => {
    callback(null, JSON.parse(param).foo);
  }, 50);
};
