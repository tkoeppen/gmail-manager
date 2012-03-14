// Gmail Manager
// By Todd Long <longfocus@gmail.com>
// http://www.longfocus.com/firefox/gmanager/

const EXTENSION = "Gmail Manager";
const VERSION   = "0.6.4.1.5";
const ID        = "{582195F5-92E7-40a0-A127-DB71295901D7}";
const NAME      = "gmanager";
const KEY       = "/gmanager";
const JAR_FILE  = NAME + ".jar";
const LOCALES   = ["en-US", "ar-SA", "bg-BG", "ca-AD", "cs-CZ", "da-DK", "de-DE", "el-GR",
                   "es-AR", "es-CL", "es-ES", "eu-ES", "fa-IR", "fi-FI", "fr-FR", "gl-ES",
                   "he-IL", "hr-HR", "hu-HU", "it-IT", "ja-JP", "ko-KR", "lt-LT", "nl-NL",
                   "pl-PL", "pt-BR", "pt-PT", "ro-RO", "ru-RU", "sk-SK", "sl-SI", "sr-RS",
                   "sv-SE", "th-TH", "tr-TR", "uk-UA", "vi-VN", "zh-CN", "zh-TW"];

// Begin the install
initInstall(NAME, KEY, VERSION);

var mainDir = getFolder("Profile", "extensions/" + ID);
var chromeDir = getFolder(mainDir, "chrome");
var jarDir = getFolder(chromeDir, JAR_FILE);

// Chrome JAR file
addFile(KEY, VERSION, "chrome/" + JAR_FILE, chromeDir, null);

// Defaults (i.e. preferences and transforms)
addDirectory(KEY, VERSION, "defaults", getFolder(mainDir, "defaults"), null);
addDirectory(KEY, VERSION, "defaults/preferences", getFolder("Program", "defaults/pref"), null);

// Hack to register components
addFile(KEY, VERSION, "defaults/.autoreg", getFolder("Program"), null);

// XPCOM components
addDirectory(KEY, VERSION, "components", getFolder("Components"), null);

// Content and Skin
registerChrome(CONTENT | PROFILE_CHROME, jarDir, "content/");
registerChrome(SKIN | PROFILE_CHROME, jarDir, "skin/classic/");

// Locales
for (var i = 0; i < LOCALES.length; i++)
  registerChrome(LOCALE | PROFILE_CHROME, jarDir, "locale/" + LOCALES[i] + "/");

// Make sure everything is like it should be...
if (getLastError() === SUCCESS)
{
  performInstall();
  alert(EXTENSION + " " + VERSION + " was installed successfully.\nPlease restart to begin using this extension.");
}
else
  cancelInstall();
