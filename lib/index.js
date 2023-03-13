/**
 * Export `Create`
 */

module.exports = Crawler

/**
 * Module Dependencies
 */

const context = require('http-context')
const enqueue = require('enqueue')
const wrapfn = require('wrap-fn')
const noop = function () {}
const ms = require('ms')

/**
 * Locals
 */

const rate_limit = require('./rate-limit')
const http = require('./http-driver')
const range = require('./range')

/**
 * Debug
 */

const debug = require('debug')('x-ray-crawler')

/**
 * Initialize a `Crawler`
 *
 * @param {Function} driver (optional)
 * @return {Function} crawler(url, fn)
 * @api public
 */

function Crawler (driver) {
  driver = driver || http()

  // defaults
  let throttle = rate_limit()
  let concurrency = Infinity
  let limit = Infinity
  let request = noop
  let timeout = false
  let response = noop
  let delay = range()
  let queue = false

  /**
   * Make a request
   */

  function crawler (url, fn) {
    // co support
    if (arguments.length === 1) {
      return function _crawler (fn) {
        return crawler(url, fn)
      }
    }

    if (!queue) {
      const options = {
        concurrency,
        timeout,
        limit
      }

      queue = enqueue(get, options)
      queue(url, fn)
    } else {
      schedule(url, fn)
    }

    return crawler
  }

  /**
   * Fetch the `url` based on the `driver`
   *
   * @param {String} url
   * @param {Function} fn
   */

  function get (url, fn) {
    debug('getting: %s', url)
    const ctx = context()
    ctx.url = url

    // request hook
    request(ctx.request)

    wrapfn(driver, result)(ctx)

    // HTTP response
    function result (err, res) {
      if (err) return fn(err)

      // update the context
      if (res && res !== ctx) ctx.body = res

      // post-flight. modify the response
      response(ctx.response)

      fn(null, ctx)
    }
  }

  /**
   * Schedule another request for later
   *
   * @param {String} url
   * @param {Function} fn
   */

  function schedule (url, fn) {
    // if we've reached the limit, don't request anymore
    if (--limit <= 0) return

    // if specified, throttle requests and add a delay
    const wait = throttle() + delay()

    debug('queued: "%s", waiting "%sms"', url, wait)
    setTimeout(function () {
      // queue up next request
      const queued = queue(url, fn)
      if (!queued) return
    }, wait)
  }

  /**
   * Get or set the driver
   *
   * @param {Function} driver
   * @return {Function|Crawler}
   * @api public
   */

  crawler.driver = function (fn) {
    if (!arguments.length) return driver
    driver = fn
    return crawler
  }

  /**
   * Throttle according to a rate limit
   *
   * @param {Number|String} requests
   * @param {Number|String} rate
   * @return {Number|Crawler}
   * @api public
   */

  crawler.throttle = function (requests, rate) {
    if (!arguments.length) return throttle

    if (arguments.length === 1) {
      rate = requests
      requests = 1
    }

    rate = /^\d/.test(rate) ? rate : 1 + rate
    rate = typeof rate === 'string' ? ms(rate) : rate
    throttle = rate_limit(requests, rate)
    return crawler
  }

  /**
   * Delay subsequent requests
   *
   * @param {String|Number} from
   * @param {String|Number} to (optional)
   * @return {Number|Crawler}
   * @api public
   */

  crawler.delay = function (from, to) {
    if (!arguments.length) return delay
    from = typeof from === 'string' ? ms(from) : from
    to = typeof to === 'string' ? ms(to) : to
    delay = range(from, to)
    return crawler
  }

  /**
   * Specify a request timeout
   *
   * @param {String|Number} timeout
   * @return {Number|Crawler}
   * @api public
   */

  crawler.timeout = function (n) {
    if (!arguments.length) return n
    timeout = typeof n === 'string' ? ms(n) : n
    return crawler
  }

  /**
   * Specify a request concurrency
   *
   * @param {Number} n
   * @return {Number|crawler}
   */

  crawler.concurrency = function (n) {
    if (!arguments.length) return concurrency
    concurrency = n
    return crawler
  }

  /**
   * Hook into the request
   *
   * @param {Function} fn
   * @return {Function|crawler}
   */

  crawler.request = function (fn) {
    if (!arguments.length) return request
    request = fn
    return crawler
  }

  /**
   * Hook into the response
   *
   * @param {Function} fn
   * @return {Function|crawler}
   */

  crawler.response = function (fn) {
    if (!arguments.length) return response
    response = fn
    return crawler
  }

  /**
   * Limit the total number of requests
   *
   * @param {Number} n
   * @return {Number|crawler}
   */

  crawler.limit = function (n) {
    if (!arguments.length) return limit
    limit = n
    return crawler
  }

  return crawler
}
