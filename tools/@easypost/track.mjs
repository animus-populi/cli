export default ({task, state, request, tools: {encodeBase64, httpPost}}) => {
  request('encodedKey', encodeBase64(`${state.account.key}:`));
  request('response', httpPost({
    url: 'https://easypost.com/api/track',
    headers: {
      'Authentication': `Basic ${state.encodedKey}`
    },
    body: `tracker[tracking_code]=${task.trackingNumber}`
  }));
  return state.response;
}
