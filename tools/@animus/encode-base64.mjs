export default ({task}) => Buffer.from(task.data).toString('base64');
