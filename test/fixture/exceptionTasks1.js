module.exports = (param, previousResult, callback) => {
  setTimeout(() => {
    callback(new Error('This is an error message'));
  }, 10);
};
