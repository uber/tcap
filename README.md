# tcap

<!--
    [![build status][build-png]][build]
    [![Coverage Status][cover-png]][cover]
    [![Davis Dependency status][dep-png]][dep]
-->

<!-- [![NPM][npm-png]][npm] -->

Uses pcap to inspect tchannel traffic over a network interface.

```
  Usage: tcap [options]

  Options:

    -h, --help                 output usage information
    -V, --version              output the version number
    -i --interface [interface  network interface name for capture (defaults to first with an address)
    -f --filter [filter]       packet filter in pcap-filter(7) syntax (default: all TCP packets on port 4040)
    -b --buffer-size [mb]      size in MiB to buffer between libpcap and app (default: 10)
    --no-color                 disables colors (default: not attached to a tty)
```

## Example

To monitor incoming and outgoing tchannel packets on port 4040 over the loopback interface on a Mac:

```
tcap -i lo0
```

## Installation

`npm install tcap -g`

## Tests

`npm test`

## NPM scripts

 - `npm run add-licence` This will add the licence headers.
 - `npm run cover` This runs the tests with code coverage
 - `npm run lint` This will run the linter on your code
 - `npm test` This will run the tests.
 - `npm run trace` This will run your tests in tracing mode.
 - `npm run travis` This is run by travis.CI to run your tests
 - `npm run view-cover` This will show code coverage in a browser

## Contributors

 - kriskowal

## MIT Licenced

  [build-png]: https://secure.travis-ci.org/uber/tcap.png
  [build]: https://travis-ci.org/uber/tcap
  [cover-png]: https://coveralls.io/repos/uber/tcap/badge.png
  [cover]: https://coveralls.io/r/uber/tcap
  [dep-png]: https://david-dm.org/uber/tcap.png
  [dep]: https://david-dm.org/uber/tcap
  [test-png]: https://ci.testling.com/uber/tcap.png
  [tes]: https://ci.testling.com/uber/tcap
  [npm-png]: https://nodei.co/npm/tcap.png?stars&downloads
  [npm]: https://nodei.co/npm/tcap
