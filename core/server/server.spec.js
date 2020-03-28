'use strict'

const { expect } = require('chai')
const isSvg = require('is-svg')
const portfinder = require('portfinder')
const config = require('config')
const got = require('../got-test-client')
const Server = require('./server')
const { createTestServer } = require('./in-process-server-test-helpers')

describe('The server', function() {
  let server, baseUrl
  before('Start the server', async function() {
    // Fixes https://github.com/badges/shields/issues/2611
    this.timeout(10000)
    const port = await portfinder.getPortPromise()
    server = createTestServer({ port })
    baseUrl = server.baseUrl
    await server.start()
  })
  after('Shut down the server', async function() {
    if (server) {
      await server.stop()
    }
    server = undefined
  })

  it('should allow strings for port', async function() {
    // fixes #4391 - This allows the app to be run using iisnode, which uses a named pipe for the port.
    const pipeServer = createTestServer({
      port: '\\\\.\\pipe\\9c137306-7c4d-461e-b7cf-5213a3939ad6',
    })
    expect(pipeServer).to.not.be.undefined
  })

  it('should produce colorscheme badges', async function() {
    const { statusCode, body } = await got(`${baseUrl}:fruit-apple-green.svg`)
    expect(statusCode).to.equal(200)
    expect(body)
      .to.satisfy(isSvg)
      .and.to.include('fruit')
      .and.to.include('apple')
  })

  it('should redirect colorscheme PNG badges as configured', async function() {
    const { statusCode, headers } = await got(
      `${baseUrl}:fruit-apple-green.png`,
      {
        followRedirect: false,
      }
    )
    expect(statusCode).to.equal(301)
    expect(headers.location).to.equal(
      'http://raster.example.test/:fruit-apple-green.png'
    )
  })

  it('should redirect modern PNG badges as configured', async function() {
    const { statusCode, headers } = await got(`${baseUrl}npm/v/express.png`, {
      followRedirect: false,
    })
    expect(statusCode).to.equal(301)
    expect(headers.location).to.equal(
      'http://raster.example.test/npm/v/express.png'
    )
  })

  it('should produce json badges', async function() {
    const { statusCode, body, headers } = await got(
      `${baseUrl}twitter/follow/_Pyves.json`
    )
    expect(statusCode).to.equal(200)
    expect(headers['content-type']).to.equal('application/json')
    expect(() => JSON.parse(body)).not.to.throw()
  })

  it('should preserve label case', async function() {
    const { statusCode, body } = await got(`${baseUrl}:fRuiT-apple-green.svg`)
    expect(statusCode).to.equal(200)
    expect(body)
      .to.satisfy(isSvg)
      .and.to.include('fRuiT')
  })

  // https://github.com/badges/shields/pull/1319
  it('should not crash with a numeric logo', async function() {
    const { statusCode, body } = await got(
      `${baseUrl}:fruit-apple-green.svg?logo=1`
    )
    expect(statusCode).to.equal(200)
    expect(body)
      .to.satisfy(isSvg)
      .and.to.include('fruit')
      .and.to.include('apple')
  })

  it('should not crash with a numeric link', async function() {
    const { statusCode, body } = await got(
      `${baseUrl}:fruit-apple-green.svg?link=1`
    )
    expect(statusCode).to.equal(200)
    expect(body)
      .to.satisfy(isSvg)
      .and.to.include('fruit')
      .and.to.include('apple')
  })

  it('should not crash with a boolean link', async function() {
    const { statusCode, body } = await got(
      `${baseUrl}:fruit-apple-green.svg?link=true`
    )
    expect(statusCode).to.equal(200)
    expect(body)
      .to.satisfy(isSvg)
      .and.to.include('fruit')
      .and.to.include('apple')
  })

  it('should return the 404 badge for unknown badges', async function() {
    const { statusCode, body } = await got(
      `${baseUrl}this/is/not/a/badge.svg`,
      {
        throwHttpErrors: false,
      }
    )
    expect(statusCode).to.equal(404)
    expect(body)
      .to.satisfy(isSvg)
      .and.to.include('404')
      .and.to.include('badge not found')
  })

  it('should return the 404 badge page for rando links', async function() {
    const { statusCode, body } = await got(
      `${baseUrl}this/is/most/definitely/not/a/badge.js`,
      {
        throwHttpErrors: false,
      }
    )
    expect(statusCode).to.equal(404)
    expect(body)
      .to.satisfy(isSvg)
      .and.to.include('404')
      .and.to.include('badge not found')
  })

  it('should redirect the root as configured', async function() {
    const { statusCode, headers } = await got(baseUrl, {
      followRedirect: false,
    })

    expect(statusCode).to.equal(302)
    // This value is set in `config/test.yml`
    expect(headers.location).to.equal('http://frontend.example.test')
  })

  it('should return the 410 badge for obsolete formats', async function() {
    const { statusCode, body } = await got(`${baseUrl}npm/v/express.jpg`, {
      throwHttpErrors: false,
    })
    // TODO It would be nice if this were 404 or 410.
    expect(statusCode).to.equal(200)
    expect(body)
      .to.satisfy(isSvg)
      .and.to.include('410')
      .and.to.include('jpg no longer available')
  })

  describe('instance metadata', function() {
    it('should return passed instance id', function() {
      const server = new Server(config.util.toObject(), {
        id: 'test-instance-id',
      })
      expect(server.instanceMetadata.id).to.equal('test-instance-id')
    })

    it('should generate new instance id if none was passed', function() {
      const server = new Server(config.util.toObject(), {})
      expect(server.instanceMetadata.id).to.not.be.empty
    })
  })
  describe('configuration validation', function() {
    let customConfig
    beforeEach(function() {
      customConfig = config.util.toObject()
      customConfig.public.metrics.influx = {
        enabled: true,
        uri: 'http://localhost:8081/telegraf',
        timeoutMilliseconds: 1000,
        intervalSeconds: 2,
      }
      customConfig.private.metrics = {
        influx: {
          username: 'telegraf',
          password: 'telegrafpass',
        },
      }
    })

    it('should not require influx configuration', function() {
      delete customConfig.public.metrics.influx
      expect(() => new Server(config.util.toObject(), {})).to.not.throw()
    })

    it('should require uri when influx configuration is enabled', function() {
      delete customConfig.public.metrics.influx.uri
      expect(() => new Server(customConfig, {})).to.throw(
        '"metrics.influx.uri" is required'
      )
    })

    it('should require timeoutMilliseconds when influx configuration is enabled', function() {
      delete customConfig.public.metrics.influx.timeoutMilliseconds
      expect(() => new Server(customConfig, {})).to.throw(
        '"metrics.influx.timeoutMilliseconds" is required'
      )
    })

    it('should require intervalSeconds when influx configuration is enabled', function() {
      delete customConfig.public.metrics.influx.intervalSeconds
      expect(() => new Server(customConfig, {})).to.throw(
        '"metrics.influx.intervalSeconds" is required'
      )
    })

    it('should require private influx config when influx configuration is enabled', function() {
      delete customConfig.private.metrics.influx
      expect(() => new Server(customConfig, {})).to.throw(
        'Private configuration is invalid. Check these paths: metrics,influx'
      )
    })

    it('should require username when influx configuration is enabled', function() {
      delete customConfig.private.metrics.influx.username
      expect(() => new Server(customConfig, {})).to.throw(
        'Private configuration is invalid. Check these paths: metrics,influx,username'
      )
    })

    it('should require password when influx configuration is enabled', function() {
      delete customConfig.private.metrics.influx.password
      expect(() => new Server(customConfig, {})).to.throw(
        'Private configuration is invalid. Check these paths: metrics,influx,password'
      )
    })
  })
})
