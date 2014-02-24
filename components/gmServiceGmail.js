// Gmail Manager
// By Todd Long <longfocus@gmail.com>
// http://www.longfocus.com/firefox/gmanager/

const GM_CLASS_NAME = "Gmail Account Service";
const GM_CLASS_ID = Components.ID("{b07df9d0-f7dd-11da-974d-0800200c9a66}");
const GM_CONTRACT_ID = "@longfocus.com/gmanager/service/gmail;1";

const GM_NOTIFY_STATE = "gmanager-accounts-notify-state";

const GM_TIMEOUT_INTERVAL = 30000;

function gmServiceGmail()
{
  // Load the services
  this._logger = Components.classes["@longfocus.com/gmanager/logger;1"].getService(Components.interfaces.gmILogger);
  this._cookieManager = Components.classes["@mozilla.org/cookiemanager;1"].getService(Components.interfaces.nsICookieManager2);
  this._observer = Components.classes["@mozilla.org/observer-service;1"].getService(Components.interfaces.nsIObserverService);
  this._timer = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
}
gmServiceGmail.prototype = {
  _email: null,
  _password: null,
  _isHosted: false,
  _username: null,
  _domain: null,
  _loginURL: null,
  _checkURL: null,
  _atomURL: null,
  _status: Components.interfaces.gmIService.STATE_LOGGED_OUT,
  _loggedIn: false,
  _checking: false,
  _inboxUnread: 0,
  _savedDrafts: 0,
  _spamUnread: 0,
  _spaceUsed: null,
  _percentUsed: null,
  _totalSpace: null,
  _labels: null,
  _snippets: null,
  _connection: null,
  _connectionPhase: 0,
  
  _log: function(aMsg)
  {
    this._logger.log("(" + this.email + ") " + aMsg);
  },
  
  /**
   * gmIServiceGmail
   */
  get isHosted() { return this._isHosted; },
  get username() { return this._username; },
  get domain() { return this._domain; },
  
  /**
   * gmIService
   */
  get email() { return this._email; },
  get status() { return this._status; },
  get loggedIn() { return this._loggedIn; },
  get checking() { return this._checking; },
  get inboxUnread() { return this._inboxUnread; },
  get savedDrafts() { return this._savedDrafts; },
  get spamUnread() { return this._spamUnread; },
  get spaceUsed() { return this._spaceUsed; },
  get percentUsed() { return this._percentUsed; },
  get totalSpace() { return this._totalSpace; },
  
  getFolder: function(aPassword, aFolderId)
  {
    const builtinFolderIds = [
      "#contacts", "compose", "#inbox", "#starred", "#sent",
      "#chats", "#drafts", "#all", "#spam", "#trash"
    ];
    
    return this._getServiceURI(aPassword);
  },
  
  getMessage: function(aPassword, aMessageId)
  {
    return this._getServiceURI(aPassword, (aMessageId ? "#inbox/" + aMessageId : "#inbox"));
  },
  
  getCompose: function(aPassword, aHref)
  {
    var href = (aHref ? aHref.replace(/^mailto:/i, "&to=").replace(/subject=/i, "su=").replace(/ /g, "%20").replace(/[?]/, "&") : "");
    return this._getServiceURI(aPassword, "view=cm&fs=1" + href);
  },
  
  _getServiceURI: function(aPassword, /* Optional */ aContinueData)
  {
    // Create the connection and send the server request
    var connection = Components.classes["@longfocus.com/gmanager/connection;1"].createInstance(Components.interfaces.gmIConnection);
    connection.send(this._loginURL, null);
    
    var serviceURI = {
      "url" : this._loginURL,
      "data" : this._getPostData(connection.data, (aPassword || this._password), aContinueData)
    };
    
    // Load the connection cookies
    this._cookieLoader(connection.getCookies({}));
    
    return serviceURI;
  },
  
  _getPostData: function(aData, aPassword, /* Optional */ aContinueData)
  {
    var postData = [];
    var loginData = {
      "service" : "mail",
      "continue" : encodeURIComponent(this._checkURL + (aContinueData || "")),
      "Email" : encodeURIComponent(this.isHosted ? this.username : this.email),
      "Passwd" : encodeURIComponent(aPassword)
    };
    
    var formMatches = aData.match(/<form[^>]+?id=["']gaia_loginform["'](?:.|\s)+?<\/form>/i);
    
    if (formMatches && formMatches.length > 0)
    {
      var inputMatches = (formMatches[0].match(/<input[^>]+?\/?>/ig) || []);
      
      inputMatches.forEach(function(input, index, array) {
        try {
          var inputName = (input.match(/name=["'](.+?)["']/i) || [])[1];
          
          if (inputName && !(inputName in loginData))
          {
            var inputValue = (input.match(/value=["'](.*?)["']/i) || [])[1];
            postData.push(inputName + "=" + (inputValue || ""));
          }
        } catch(e) {
          this._log("Error getting the form input: " + e);
        }
      }, this);
    }
    
    for (var name in loginData)
      postData.push(name + "=" + loginData[name]);
    
    try {
      // TODO Add cookie to connection...
      
      // Gmail Offline cookie
      var cookie = {
        name: (this.isHosted ? "GAUSR@" + this.domain : "GAUSR"),
        value: this.email,
        host: "mail.google.com",
        path: (this.isHosted ? "/a/" + this.domain : "/mail"),
        isSecure: false,
        isHttpOnly: false,
        isSession: true,
        expires: Math.pow(2, 34)
      };
      
      // TODO Remove; Obsolete in Firefox 3 (Gecko 1.9)
      var hasCookie = (typeof this._cookieManager.cookieExists === "function"
        ? this._cookieManager.cookieExists(cookie)
        : this._cookieManager.findMatchingCookie(cookie, {}));
      
      // Check if the cookie exists, load if necessary
      if (!hasCookie)
        this._cookieLoader([cookie]);
    } catch(e) {
      this._log("Error loading Gmail Offline cookie: " + e);
    }
    
    return postData.join("&");
  },
  
  _cookieLoader: function(aCookies)
  {
    this._log("Start the cookie loader...");
    
    aCookies.forEach(function(cookie, index, array) {
      this._log("cookie name = " + cookie.name);
      this._log("cookie value = " + cookie.value);
      
      try {
        this._cookieManager.add(cookie.host, cookie.path, cookie.name, cookie.value, cookie.isSecure, cookie.isHttpOnly, cookie.isSession, cookie.expires);
      } catch(e) {
        this._cookieManager.add(cookie.host, cookie.path, cookie.name, cookie.value, cookie.isSecure, cookie.isSession, cookie.expires);
      }
    }, this);
    
    this._log("The cookie loader is done!");
  },
  
  getLabels: function(aCount)
  {
    var labels = (this._labels || []);
    if (aCount)
      aCount.value = labels.length;
    return labels;
  },
  
  getSnippets: function(aCount)
  {
    var snippets = (this._snippets || []);
    if (aCount)
      aCount.value = snippets.length;
    return snippets;
  },
  
  init: function(aEmail)
  {
    const mailRegExp = /@g(?:oogle)?mail.com$/i;
    
    this._email = aEmail;
    this._isHosted = !mailRegExp.test(this.email);
    this._username = this.email.split("@")[0];
    this._domain = this.email.split("@")[1];
    
    // Check if the email is hosted
    if (this.isHosted)
    {
      this._loginURL = "https://accounts.google.com/accounts/ServiceLoginAuth?service=mail";
      this._checkURL = "https://mail.google.com/mail/?";
      this._atomURL = "https://mail.google.com/a/" + this.domain + "/feed/atom/";
      // hack 2014-02-24, google seem to have changed login for apps users
      this._username = this.email;
    }
    else
    {
      this._loginURL = "https://accounts.google.com/accounts/ServiceLoginAuth?service=mail";
      this._checkURL = "https://mail.google.com/mail/?";
      this._atomURL = "https://mail.google.com/mail/feed/atom/";
    }
  },
  
  login: function(aPassword)
  {
    // Check if already logged in or checking
    if (!this.loggedIn && !this.checking)
    {
      const passwordRegExp = /^\s*$/;
      
      // Check if the password is specified
      if (aPassword == null || passwordRegExp.test(aPassword))
      {
        // Password error, lets just give up
        this.logout(Components.interfaces.gmIService.STATE_ERROR_PASSWORD);
      }
      else
      {
        // Save the password in case of connection timeout
        this._password = aPassword;
        
        // Set checking and the connection phase
        this._setChecking(true);
        this._connectionPhase = 0;
        
        // Create the connection and send the server request
        this._connection = Components.classes["@longfocus.com/gmanager/connection;1"].createInstance(Components.interfaces.gmIConnection);
        this._connection.sendAsync(this._loginURL, null, this);
      }
    }
  },
  
  logout: function(/* Optional */ aStatus)
  {
    if (this.checking)
      this._setChecking(false);
    
    this._defaults();
    this._setStatus(aStatus || Components.interfaces.gmIService.STATE_LOGGED_OUT);
  },
  
  check: function()
  {
    // Check if already checking
    if (!this.checking)
    {
      // Set checking and the connection phase
      this._setChecking(true);
      this._connectionPhase = 1;
      
      // Send the server request
      this._connection.sendAsync(this._checkURL + "labs=0", null, this);
    }
  },
  
  notify: function(aTimer)
  {
    // Check if already checking
    if (this.checking)
    {
      // Timeout error, try again in 30 seconds
      this._setRetryError(Components.interfaces.gmIService.STATE_ERROR_TIMEOUT);
    }
    else
    {
      // Check if already logged in
      if (this.loggedIn)
        this.check();
      else
        this.login(this._password);
    }
  },
  
  resetUnread: function()
  {
    // Reset the unread counts
    this._inboxUnread = 0;
    this._spamUnread = 0;
    this._snippets = null;
    
    if (this._labels)
    {
      for (var i = 0, n = this._labels.length; i < n; i++)
        this._labels[i].unread = 0;
    }
    
    // Update the status so that any observers get notified 
    // and can update the account details appropriately
    this._setStatus(this.status);
  },
  
  _setStatus: function(aStatus)
  {
    // Notify the observers with the status
    this._status = aStatus;
    this._observer.notifyObservers(null, GM_NOTIFY_STATE, this.email);
  },
  
  _setChecking: function(aChecking)
  {
    if (aChecking)
    {
      // Set the status connecting
      this._setStatus(Components.interfaces.gmIService.STATE_CONNECTING);
      
      // Start the timeout timer (30 seconds)
      this._startTimer(GM_TIMEOUT_INTERVAL);
    }
    else
    {
      // Stop the timeout timer
      this._timer.cancel();
    }
    
    // Set whether checking or not
    this._checking = aChecking;
  },
  
  _startTimer: function(aInterval)
  {
    // Stop the timeout timer
    this._timer.cancel();
    
    // Start the timeout timer, fire only once
    this._timer.initWithCallback(this, aInterval, Components.interfaces.nsITimer.TYPE_ONE_SHOT);
  },
  
  _setRetryError: function(aStatus)
  {
    this._setChecking(false);
    this._setStatus(aStatus);
    this._startTimer(GM_TIMEOUT_INTERVAL);
  },
  
  _defaults: function()
  {
    // Account details
    this._password = null;
    this._loggedIn = false;
    this._checking = false;
    this._inboxUnread = 0;
    this._savedDrafts = 0;
    this._spamUnread = 0;
    this._spaceUsed = null;
    this._percentUsed = null;
    this._totalSpace = null;
    this._labels = null;
    this._snippets = null;
    
    // Login stuff
    this._connection = null;
    this._connectionPhase = 0;
  },
  
  callback: function(aConnection)
  {
    try {
      // Get the HTTP channel
      var httpChannel = aConnection.channel.QueryInterface(Components.interfaces.nsIHttpChannel);
      
      this._log("connection phase = " + this._connectionPhase);
      this._log("http response status = " + httpChannel.responseStatus);
      this._log("http URI path = " + httpChannel.URI.path);
      
      if (httpChannel.responseStatus !== 200) // Bad status
      {
        // Server error, try again in 30 seconds
        this._setRetryError(Components.interfaces.gmIService.STATE_ERROR_NETWORK);
      }
      else if (this._connectionPhase > 0)
      {
        const loginRegExp = /\/(?:ServiceLoginAuth|LoginAction)/i;
        const cookieRegExp = /\/(?:SetSID|CheckCookie)/i;
        
        if (loginRegExp.test(httpChannel.URI.path)) // Bad password
        {
          // Check if already logged in
          if (this.loggedIn)
          {
            // Ok, lets try logging in again
            this.login(this._password);
          }
          else
          {
            // Password error, lets just give up
            this.logout(Components.interfaces.gmIService.STATE_ERROR_PASSWORD);
          }
        }
        else if (cookieRegExp.test(httpChannel.URI.path)) // Bad cookie
        {
          try {
            this._log("data = " + aConnection.data);
            
            var redirectURL = (aConnection.data.match(/<meta.+?url=(?:'|&#39;)(.+?)(?:'|&#39;)/i) || [])[1];
            
            if (redirectURL == null)
            {
              this._log("Unable to parse meta tag, trying location.replace...");
              
              redirectURL = (aConnection.data.match(/location.replace\(["'](.+?)["']\)/i) || [])[1];
            }
            
            if (redirectURL)
            {
              this._log("redirect URL = " + redirectURL);
              
              redirectURL = decodeURIComponent(redirectURL);
              
              this._log("redirect URL (decoded) = " + redirectURL);
              
              // Send the server request
              this._connection.sendAsync(redirectURL, null, this);
              
              // Let the redirect URL do the work
              return;
            }
          } catch(e) {
            this._log("Error getting the redirect URL: " + e);
          }
        }
      }
    } catch(e) {
      // Network error, try again in 30 seconds
      this._setRetryError(Components.interfaces.gmIService.STATE_ERROR_NETWORK);
    }
    
    // Only continue if we're still checking!
    if (this.checking)
    {
      const viewDataRegExp = /var\s+VIEW_DATA\s*=/i;
      
      // Get the connection data
      var data = aConnection.data;
      
      this._log("data = " + data);
      
      if (viewDataRegExp.test(data))
        this._connectionPhase = 2;
      
      // Ok, everything looks good so far =)
      switch (++this._connectionPhase)
      {
        case 1:
        {
          this._log("Begin login process by sending POST data...");
          
          // Send the server request
          this._connection.sendAsync(this._loginURL, this._getPostData(data, this._password), this);
          break;
        }
        case 2:
        {
          this._log("Unable to find VIEW_DATA, trying again...");
          
          // Send the server request
          this._connection.sendAsync(this._checkURL + "labs=0", null, this);
          break;
        }
        case 3:
        {
          // TODO Check if we actually have good data...
          
          try {
            // Quota
            var quMatches = jsonParse(data.match(/\["qu",(?:.|\s)+?]/)[0]);
            
            this._spaceUsed = quMatches[1];
            this._totalSpace = quMatches[2];
            this._percentUsed = quMatches[3];
            
            this._log("space used = " + this.spaceUsed);
            this._log("total space = " + this.totalSpace);
            this._log("percent used = " + this.percentUsed);
          } catch(e) {
            this._log("Error getting the quota: " + e);
          }
          
          try {
            // Inbox/Drafts/Spam/Labels
            var ldMatchesPre = data.match(/\["ld",(?:.|\s)+?(?:\s*[\[\]]){3}/)[0];
            var ldMatches = jsonParse(ldMatchesPre.replace(/([\[,])["'](.+?)["'](?=[,\]])/g, this._inverter));
            
            ldMatches[1].forEach(function(element, index, array) {
              const keyLabelMap = {
                "^i" : ["_inboxUnread", 1],
                "^r" : ["_savedDrafts", 2],
                "^s" : ["_spamUnread", 1]
              };
              
              var key = element[0];
              
              if (key in keyLabelMap)
                this[keyLabelMap[key][0]] = Math.max(0, element[keyLabelMap[key][1]]);
            }, this);
            
            this._log("inboxUnread = " + this.inboxUnread);
            this._log("savedDrafts = " + this.savedDrafts);
            this._log("spamUnread = " + this.spamUnread);
            
            // Initialize the labels
            this._labels = [];
            
            ldMatches[2].forEach(function(element, index, array) {
              this._labels.push({
                "name" : this._replaceHtmlCodes(element[0]),
                "unread" : element[1],
                "total" : element[2]
              });
            }, this);
            
            if (this._labels.length > 0)
            {
              this._log(this._labels.length + " labels(s) were found");
              
              this._labels.forEach(function(label, index, array) {
                this._log(label.name + " (" + label.unread + (label.total > 0 ? " of " + label.total : "") + ")");
              }, this);
            }
            else
              this._log("no labels were found");
          } catch(e) {
            this._log("Error getting the unread counts: " + e);
          }
          
          try {
            var tbMatches = data.match(/\["tb",(?:.|\s)+?](?:\s]){2,}(?!\s,,)/g);
            
            // Initialize the snippets
            this._snippets = [];
            
            for (var i = 0, n = tbMatches.length; i < n; i++)
            {
              var snippets = jsonParse(tbMatches[i]);
              
              snippets[2].forEach(function(snippet, index, array) {
                // Check if the snippet is unread
                if (snippet[3] === 0)
                {
                  this._snippets.push({
                    "id" : snippet[0],
                    "from" : this._replaceHtmlCodes(this._stripHtml(snippet[7])),
                    "email" : (snippet[7].match(/email=["'](.+?)["']/i) || [])[1],
                    "subject" : this._replaceHtmlCodes(this._stripHtml(snippet[9])),
                    "msg" : this._replaceHtmlCodes(this._stripHtml(snippet[10])),
                    "date" : this._replaceHtmlCodes(this._stripHtml(snippet[14])),
                    "time" : snippet[15]
                  });
                }
              }, this);
            }
            
            if (this._snippets.length > 0)
            {
              this._log(this._snippets.length + " snippet(s) were found");
              
              for (var i = 0, n = this._snippets.length; i < n; i++)
              {
                var snippet = this._snippets[i];
                
                for (var j in snippet)
                  this._log("snippet[" + i + "]." + j + " = " + snippet[j]);
              }
            }
            else
              this._log("no snippets were found");
          } catch(e) {
            this._log("Error getting the snippets: " + e);
          }
          
          this._loggedIn = true;
          this._setChecking(false);
          this._setStatus(Components.interfaces.gmIService.STATE_LOGGED_IN);
          break;
        }
        default:
        {
          this._log("Unknown state...definitely should not be here!");
          break;
        }
      }
    }
  },
  
  _inverter: function(str, p1, p2)
  {
    try {
      return p1 + "\"" + p2.replace(/\\?"/g, "&quot;") + "\"";
    } catch(e) {
      this._log("Error inverting the data: " + e);
      return str;
    }
  },
  
  _stripHtml: function(aData)
  {
    try {
      return aData.replace(/(<([^>]+)>)/ig, "");
    } catch(e) {
      this._log("Error stripping the HTML data: " + e);
      return aData;
    }
  },
  
  _replaceHtmlCodes: function(aData)
  {
    const htmlCodes = [
      ["&gt;", ">"], ["&lt;", "<"], ["&#39;", "'"], ["&quot;", "\""],
      ["&amp;", "&"], ["&tilde;", "~"], ["&trade;", "?"], ["&copy;", "?"],
      ["&reg;", "?"], ["&hellip;", ""]
    ];
    
    htmlCodes.forEach(function(element, index, array) {
      try {
        var regExp = new RegExp(element[0], "g");
        aData = aData.replace(regExp, element[1]);
      } catch(e) {
        this._log("Error replacing the HTML codes: " + e);
      }
    }, this);
    
    return aData;
  },
  
  classDescription: GM_CLASS_NAME,
  classID: GM_CLASS_ID,
  contractID: GM_CONTRACT_ID,
  
//  QueryInterface: XPCOMUtils.generateQI([Components.interfaces.gmIServiceGmail]),
  
  QueryInterface: function(aIID)
  {
    if (aIID.equals(Components.interfaces.gmIServiceGmail) || 
        aIID.equals(Components.interfaces.gmIConnectionCallback) || 
        aIID.equals(Components.interfaces.nsISupports))
      return this;
    throw Components.results.NS_ERROR_NO_INTERFACE;
  }
}

if (Components.utils && Components.utils.import)
{
  Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
  
  if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([gmServiceGmail]);
//  else
//    var NSGetModule = XPCOMUtils.generateNSGetModule([gmServiceGmail]);
}

// TODO Remove; Obsolete in Firefox 2 (Gecko 1.8.1)

const gmanager_Factory = {
  createInstance: function(aOuter, aIID)
  {
    if (aOuter != null)
      throw Components.results.NS_ERROR_NO_AGGREGATION;
    
    return (new gmServiceGmail()).QueryInterface(aIID);
  }
}

const gmanager_Module = {
  registerSelf: function(aCompMgr, aFileSpec, aLocation, aType)
  {
    aCompMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
    aCompMgr.registerFactoryLocation(
      GM_CLASS_ID,
      GM_CLASS_NAME,
      GM_CONTRACT_ID,
      aFileSpec,
      aLocation,
      aType);
  },
  
  unregisterSelf: function(aCompMgr, aFileSpec, aLocation)
  {
    aCompMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
    aCompMgr.unregisterFactoryLocation(
      GM_CLASS_ID,
      aFileSpec);
  },
  
  getClassObject: function(aCompMgr, aCID, aIID)
  {
    if (aCID.equals(GM_CLASS_ID))
      return gmanager_Factory;
    
    if (!aIID.equals(Components.interfaces.nsIFactory))
      throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
    
    throw Components.results.NS_ERROR_NO_INTERFACE;
  },
  
  canUnload: function(aCompMgr)
  {
    return true;
  }
};

function NSGetModule(aCompMgr, aFileSpec)
{
  return gmanager_Module;
}

//This source code is free for use in the public domain.
//NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.

//http://code.google.com/p/json-sans-eval/

/**
* Parses a string of well-formed JSON text.
*
* If the input is not well-formed, then behavior is undefined, but it is
* deterministic and is guaranteed not to modify any object other than its
* return value.
*
* This does not use `eval` so is less likely to have obscure security bugs than
* json2.js.
* It is optimized for speed, so is much faster than json_parse.js.
*
* This library should be used whenever security is a concern (when JSON may
* come from an untrusted source), speed is a concern, and erroring on malformed
* JSON is *not* a concern.
*
*                      Pros                   Cons
*                    +-----------------------+-----------------------+
* json_sans_eval.js  | Fast, secure          | Not validating        |
*                    +-----------------------+-----------------------+
* json_parse.js      | Validating, secure    | Slow                  |
*                    +-----------------------+-----------------------+
* json2.js           | Fast, some validation | Potentially insecure  |
*                    +-----------------------+-----------------------+
*
* json2.js is very fast, but potentially insecure since it calls `eval` to
* parse JSON data, so an attacker might be able to supply strange JS that
* looks like JSON, but that executes arbitrary javascript.
* If you do have to use json2.js with untrusted data, make sure you keep
* your version of json2.js up to date so that you get patches as they're
* released.
*
* @param {string} json per RFC 4627
* @param {function (this:Object, string, *):*} opt_reviver optional function
*     that reworks JSON objects post-parse per Chapter 15.12 of EcmaScript3.1.
*     If supplied, the function is called with a string key, and a value.
*     The value is the property of 'this'.  The reviver should return
*     the value to use in its place.  So if dates were serialized as
*     {@code { "type": "Date", "time": 1234 }}, then a reviver might look like
*     {@code
*     function (key, value) {
*       if (value && typeof value === 'object' && 'Date' === value.type) {
*         return new Date(value.time);
*       } else {
*         return value;
*       }
*     }}.
*     If the reviver returns {@code undefined} then the property named by key
*     will be deleted from its container.
*     {@code this} is bound to the object containing the specified property.
* @return {Object|Array}
* @author Mike Samuel <mikesamuel@gmail.com>
*/
var jsonParse=function(){var r="(?:-?\\b(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?\\b)",k='(?:[^\\0-\\x08\\x0a-\\x1f"\\\\]|\\\\(?:["/\\\\bfnrt]|u[0-9A-Fa-f]{4}))';
  k='(?:"'+k+'*")';var s=new RegExp("(?:false|true|null|[\\{\\}\\[\\]]|"+r+"|"+k+")","g"),t=new RegExp("\\\\(?:([^u])|u(.{4}))","g"),u={'"':'"',"/":"/","\\":"\\",
  b:"\u0008",f:"\u000c",n:"\n",r:"\r",t:"\t"};function v(h,j,e){return j?u[j]:String.fromCharCode(parseInt(e,16))}var w=new String(""),x=Object.hasOwnProperty;
  return function(h,j){h=h.match(s);var e,c=h[0],l=false;if("{"===c)e={};else if("["===c)e=[];else{e=[];l=true}for(var b,d=[e],m=1-l,y=h.length;m<y;++m){c=h[m];
  var a;switch(c.charCodeAt(0)){default:a=d[0];a[b||a.length]=+c;b=void 0;break;case 34:c=c.substring(1,c.length-1);if(c.indexOf("\\")!==-1)c=c.replace(t,v);a=d[0];
  if(!b)if(a instanceof Array)b=a.length;else{b=c||w;break}a[b]=c;b=void 0;break;case 91:a=d[0];d.unshift(a[b||a.length]=[]);b=void 0;break;case 93:d.shift();break;
  case 102:a=d[0];a[b||a.length]=false;b=void 0;break;case 110:a=d[0];a[b||a.length]=null;b=void 0;break;case 116:a=d[0];a[b||a.length]=true;b=void 0;break;
  case 123:a=d[0];d.unshift(a[b||a.length]={});b=void 0;break;case 125:d.shift();break}}if(l){if(d.length!==1)throw new Error;e=e[0]}else if(d.length)throw new Error;
  if(j){var p=function(n,o){var f=n[o];if(f&&typeof f==="object"){var i=null;for(var g in f)if(x.call(f,g)&&f!==n){var q=p(f,g);if(q!==void 0)f[g]=q;else{i||(i=[]);
  i.push(g)}}if(i)for(g=i.length;--g>=0;)delete f[i[g]]}return j.call(n,o,f)};e=p({"":e},"")}return e}}();