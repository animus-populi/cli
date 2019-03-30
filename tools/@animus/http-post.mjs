const mockResponses = {
  'POST https://easypost.com/api/track': (req) => ({
    status: 'in_transit',
    carrier: 'USPS',
    url: 'https://easypost.com/dummy'
  }),
  'default': (req) => {}
}

export default ({task}) => (mockResponses['POST '+task.data.url] || mockResponses.default)(task.data);
