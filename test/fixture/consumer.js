module.exports = (queue, jobType, boolError) => {
  return queue.process(jobType, (job, done) => {
    if (boolError) {
      done(new Error('some error here'));
    }
    done(null, 'pong');
  });
};
