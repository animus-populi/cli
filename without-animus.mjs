import { performance } from 'perf_hooks';
import resolvePath from 'object-resolve-path';

const mockResponses = {
  'POST https://easypost.com/api/track': (req) => ({
    status: 'in_transit',
    carrier: 'USPS',
    url: 'https://easypost.com/dummy'
  }),
  'default': (req) => {}
}
const system = {
  tasks: {},
  data: {
    '@zamplebox': {
      '@easypost': {
        'account': {
          'key': "JleR1ZYkvqHi3cZk5IDqAQ"
        }
      }
    }
  }
}

const fetchData = path => resolvePath(system.data, path);
const encodeBase64 = str => Buffer.from(str).toString('base64');
const httpPost = request => {
  return (mockResponses['POST '+request.url] || mockResponses.default)(request);
}

const task = {
  trackingNumber: '1ZA275A00286321254'
};

const start = performance.now();

const state = {
  account: fetchData("['@zamplebox']['@easypost'].account")
};
state.encodedKey = encodeBase64(`${state.account.key}:`);
state.response = httpPost({
  url: 'https://easypost.com/api/track',
  headers: {
    'Authentication': `Basic ${state.encodedKey}`
  },
  body: `tracker[tracking_code]=${task.trackingNumber}`
});

const end = performance.now();
console.log('took', end-start);
