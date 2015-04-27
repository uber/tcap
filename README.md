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

    -h, --help                   output usage information
    -V, --version                output the version number
    -i --interface <interface>   network interface interfaces (defaults to first with an address)
    -p --port <port>             a port or ports to track
    -f --filter <filter>         packet filter in pcap-filter(7) syntax (default: all TCP packets on port 4040)
    -s --service <service-name>  service name or names to show (default: all services shown)
    -1 --arg1 <arg1-method>      arg1 method or methods to show (default: all arg1 methods shown)
    -r --response <response>     responses to show: O[K], N[otOk], E[rror] (default: all shown)
    -b --buffer-size <mb>        size in MiB to buffer between libpcap and app (default: 10)
    -x --hex                     show hex dumps for all packets
    --inspect                    show JSON dumps for all parsed frames
    --color                      enables colors if not connected to a tty.
    --no-color                   disables colors if connected to a tty.
```

## Example

To monitor tchannel traffic on ports 4040 and 4041 over the loopback and first
ethernet interface on a Mac:

```
tcap -i lo0 -i en0 -p 4040 -p 4041
```

Note that the interface names differ on other systems. Use ifconfig.

<!--

    ## Concept and Motivation

    // TODO. Explain what your module achieves and why.

    ## API Documentation

    ### `var someValue = tcap(/*arguments*/)`

    This is a jsig notation of this interface.
    https://github.com/jsigbiz/spec

    ```ocaml
    tcap : (arg: Any) => void
    ```

    // TODO. State what the module does.

-->

## Installation

On Linux, ensure that the libpcap headers are available to the build toolchain. On Debian or Ubuntu:

`sudo apt-get install libpcap-dev`

Install tcap either in your project, or globally as depicted:

`npm install uber/tcap -g`

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
