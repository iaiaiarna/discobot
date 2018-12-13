'use strict'
const qr = require('@perl/qr')
const Discord = require('discord.js');
const DEFAULTS = {
  token: null,
  servers: {}
}
exports.create = conf => {
  return new BaseBot({
    conf: Object.assign({}, DEFAULTS, conf || {}),
    client: new Discord.Client()
  })
}
const WELCOME = exports.Welcome = Symbol('welcome')
const DEFAULTCMD = exports.Default = Symbol('default')

class BaseBot {
  constructor ({conf, client}) {
    this.conf = conf
    this.serversById = {}
    this.client = client
      .on('ready',  this.asyncHandler(this.clientReady))
      .on('error',  this.asyncHandler(this.clientError))
      .on('message',  this.asyncHandler(this.clientMessage))
      .on('messageReactionAdd',  this.asyncHandler(this.clientMessageReactionAdd))
      .on('guildMemberAdd',  this.asyncHandler(this.clientGuildMemberAdd))
    this.commands = {}
    this.reactions = {}
    this.reactji = {}
    this.addCommand('status', {
      usage: 'status',
      description: 'Find out about the current status of the bot',
      action: async ($, {args})  => {
        return $.msg.reply(this.status($, {args}))
      }
    })
  }
  login () {
    return this.client.login(this.conf.token)
  }
  on (...args) {
    return this.client.on(...args)
  }
  addCommand (name, info) {
    this.commands[name] = info
  }
  addReaction (name, info) {
    this.reactions[name] = info
  }
  status ($) {
    return (this.conf.name ? `${this.conf.name} is alive!` : `I am alive!`)
      + ($.server ? `\nYour server is ${this.name($.server)}` : '')
  }
  // this little wrapper exists so that our async event handlers don't throw
  // away errors
  asyncHandler (fn) {
    return async (...args) => {
      try {
        return await fn.call(this, ...args)
      } catch (ex) {
        console.log(`Error running ${fn.name}:`, ex)
      }
    }
  }
  async clientError (err) {
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
      console.log('Reconnecting…')
    } else {
      console.log(JSON.stringify(err))
    }
  }

  async clientGuildMemberAdd (gm) {
    if (this.commands[WELCOME]) {
      const server = this.serversById[gm.guild.id]
      return this.commands[WELCOME].action.call(this, {msg: gm, server, bot: this})
    }
  }

  async clientMessageReactionAdd (mr, user) {
    if (!mr.message.guild) return // dm
    if (mr.me) return // ignore our own reactions

    const server = this.serversById[mr.message.guild.id]

    if (server.reactji[mr.emoji.id]) {
      return server.reactji[mr.emoji.id].call(this, {msg: mr.message, mr: mr, server, bot: this, user})
    }
  }

  async clientMessage (msg) {
    if (msg.author.id === this.client.user.id) return // ignore our own messages
    // Helpful when debugging, but logs ALL messages on the discord
    //console.log('clientMessage', msg.channel.name, msg.author.id, msg.author.username, msg.author.discriminator, msg.content)
    let cmdline = msg.content.trim()
    if (qr`^/\w`.test(cmdline)) {
      cmdline = cmdline.slice(1)
    }

    let server
    if (msg.guild) {
      server = this.serversById[msg.guild.id]
    } else {
      // the msg is a DM, so we have find the user's server on our own, this
      // is why we can't have nice things re: having this bot on multiple
      // servers
      const guilds = []
      for (let [, guild] of this.client.guilds) {
        try {
          await guild.fetchMember(msg.author, true)
          guilds.push(guild)
        } catch (ex) {
        }
      }
      if (guilds.length === 1) {
        server = this.serversById[guilds[0].id]
      }
    }
    if (!server) {
      await this.sendDM(msg.author, 'We were unable to determine exactly one server associated with you and this bot, the DM interface will be limited.')
    }

    // The callback defined on each `.command` will be run if appropriate by
    // yargs.
    let output
    const yargs = require('yargs')()
      .scriptName('')
      .usage('')
      .wrap(null)
      .exitProcess(false)
      .hide('version')
      .hide('help')
    Object.keys(this.commands).forEach(name => {
      const cmd = this.commands[name]
      if (!cmd.filter || cmd.filter({msg, server, bot: this})) {
        yargs.command(cmd.usage || name, cmd.description)
      }
    })
    if (msg.channel.type === 'dm') yargs
      .demand(1)
      .recommendCommands()

    // yargs.parse is how we get yargs to read the string we have instead of
    // our actual commandline. output handling for yargs help is… silly.
    yargs.parse(cmdline, (_1,_2,_3) => output = _3)
    if (output) return msg.reply(output)
    let argv = yargs.argv
    if (argv) {
      const cmd = this.commands[argv._[0]]
      if (cmd) {
        return cmd.action.call(this, {msg, server, bot: this}, argv)
      } else if (msg.channel.type === 'dm') {
        yargs.showHelp((..._) => output = _)
        return msg.reply(output.join(' '))
      } else {
      }
    }
    if (this.commands[null]) {
      return this.commands[null].action.call(this, {msg, server, bot: this}, cmdline)
    }
  }

  // called at startup, also after reconnects
  async clientReady () {
    console.log(`Logged in as ${this.client.user.tag}!`);
    this.client.guilds.forEach(guild => {
      console.log(`Logged into ${guild.name}, ${guild.id}`);
      if (this.conf.servers[guild.name]) {
        const server = this.conf.servers[guild.name]
        this.serversById[guild.id] = server
        server.name = guild.name
        server.guild = guild
        if (!server.emoji) server.emoji = {...(this.conf.emoji || {})}
        const reactji = ['working', ...Object.keys(this.reactions)]
        for (let name of Object.keys(server.emoji)) {
          server.emoji[name] = server.guild.emojis.find(_ => _.name === name)
        }
        if (!server.reactji) server.reactji = {}
        for (let name of reactji) {
          if (!server.emoji[name]) {
            server.emoji[name] = server.guild.emojis.find(_ => _.name === name)
          }
          server.reactji[server.emoji[name].id] = this.reactions[name]
        }
        guild.channels.forEach(ch => {
          for (let key of Object.keys(server.channels)) {
            if (server.channels[key] === ch.name) {
              server[key] = ch
            }
          }
        })
      } else {
        // This would only happen if the bot were added to another server and
        // I didn't have them in my config file. As bot DM functionality kinda breaks
        // with multiple servers, I may not ever do that.
        console.log(`Unknown server: ${guild.name}`)
        this.serversById[guild.id] = this.conf.servers[guild.name] = {
          name: guild.name,
          channels: { moderation, welcome }
        }
      }
    })
  }
  async withSpin ($, action) {
    let progressP
    let timeoutID = setTimeout(() => {
      progressP = $.msg.react($.server.emoji.working)
    }, 50)
    const result = await action
    clearTimeout(timeoutID)
    if (progressP) {
      const progress = await progressP
      await progress.remove(this.client.user)
    }
    return result
  }
  name (thing) {
     if (!thing) return thing
     if (typeof thing === 'string') return thing
     let name = thing.name || thing.username
     if (thing.discriminator) name += '#' + thing.discriminator
     return name
  }

  async sendDM (user, msg, opts) {
    const dm = user.dmChannel || await user.createDM()
    return dm.send(msg)
  }
}



