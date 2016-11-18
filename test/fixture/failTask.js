module.exports = (param, previousResult, callback) => {
  setTimeout(() => {
    callback(new Error('some problems occur'), null);
  }, 50);
};
