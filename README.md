# @iarna/discobot

A little framework to build my Discord bots off of.

## SYNOPSIS

```js
const Discobot = require('@iarna/discobot')
const bot = Discobot.create({token: '####'})
bot.addCommand('example', {
  usage: 'example <arg1> <arg2>', // a yargs usage line
  description: 'a description of this command for help',
  filter: ({msg, server}) => …, // an optional filter, on false the command won't be available
  action: async ({msg, server, bot}) => {
    …
  }
})
bot.login()
```

## CONSTRUCTION

### const bot = Discobot.create({token[, servers]}) -> botobj

Constructs a new bot.  All bots come with help and status commands.  You'll
have to add more yourself.  The bot won't login to Discord until you call
`bot.login()`.

If servers is included, it's a set of configuration for specific servers
using this bot.  It's keyed by server name which means its illsuited to
servers that change their name all the time.  It currently can have one key,
`channels`, which provides a mapping for channel names. For keys with string values:

Each key is a name that will be used within your bot to refer to that
channel, each value is the name of the channel on the server.  During
initialization, the channel list is scanned nad mapped to values on the
`SERVER OBJECT` (see below).  So say, if you included `"moderation": "Our
Admin Channel"` then later on you could use `server.moderation` to send
messages to `Our Admin Channel`.


## METHODS

### bot.login()

Initiate a connection to the Discord server.

### bot.addCommand(name, spec)

Register a new command to be available to users. `spec` is an object with the following keys:

* usage - A yargs usage string.
* description - A description for the help screen.
* filter - (optional) A function that takes ({msg, server}) as an argument and returns true or false if this command should or should not be avaiable. This lets you filter commands to admins only, for example.
* action: - An async function that takes ({msg, server, bot}, argv) and does whatever this command does. `this` and `bot` are the same value. `argv` is the yargs command line parse result. `msg` is the Discord message that triggered this command. `server` describes which server we're connected to. See `SERVER OBJECT` below for details.


### SERVER OBJECT

Represents information about the server the user is on, contains the folowing keys:

* name: The name of the server.
* guild: The Discord object representation of the server.
* emoji: `{report, working}` Emoji objects with names matching report and working.
* channels: `{}` Arbitrary channel configuration passed in as part of the server object during construction.
* "<channelName>": For channels declared in the channel object, name->obj mappings for them.
