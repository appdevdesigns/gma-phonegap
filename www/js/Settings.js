/************************************************************************/
/**
 * @object Settings
 * Joshua Chan <joshua@appdevdesigns.net>
 *
 *  Dependencies:
 *    - jQuery
 *        
 */


var Settings = {

    debugMode: false,

    // This is the URL where the multilingual dictionary will be fetched from
    // (see language.js)
    dictionaryAuthority: 'http://gma-android-abc-xyz.net/i18n/',
    defaultLang: 'en',
    
    // This is the URL where the latest available profiles will be fetched from
    profileAuthority: 'http://gma-android-abc-xyz.net/profiles.json',
    
    // These are the default hard coded profiles
    profiles: [
        {
            gmaBase: 'https://globalopsccci.org/gma47demo1/',
            casURL: 'https://thekey.me/cas',
            label: 'Global Ops Demo'
        }
    ],
    
    // The index of the currently selected profile
    currentProfile: 0,
    
    // The settings can be locked in to one server profile
    // saving the user from having to select from a list.
    lockedInMode: false,
    
    /**
     * Fetch the latest profiles from our server
     */
    fetchProfiles: function () {
        var dfd = $.Deferred();
        var self = this;
        
        $.ajax({
            url: self.profileAuthority,
            method: 'GET',
            dataType: 'json'
        })
        .then(function(data, status, res){
            if (data instanceof Array) {
                // If the profile authority server was reachable, then
                // enable locked in mode.
                self.lockedInMode = true;
            
                self.profiles = data;
                dfd.resolve(self.profiles);
            }
            else {
                dfd.reject(new Error("Unexpected profile data"));
            }
        })
        .fail(function(res, status, err){
            dfd.reject(err);
        });
        
        return dfd;
    },
    
    customProfile: {
        gmaBase: 'http://gma.example.com/',
        casURL: 'https://signin.example.com/cas',
        label: 'Custom server...'
    },
    
    setCustomProfile: function (profile) {
        Settings.customProfile = profile;
    },
    
    getCustomProfile: function () {
        return Settings.customProfile;
    },
    
    getProfile: function (key) {
        key = key || Settings.currentProfile;

        if (key == 'custom') {
            return Settings.customProfile;
        }
        else {
            return Settings.profiles[parseInt(key)];
        }
    },
    
    getLabel: function (key) {
        return this.getProfile(key).label;
    },
    
    getGmaBase: function (key) {
        return this.getProfile(key).gmaBase;
    },
    
    getCasUrl: function (key) {
        return this.getProfile(key).casURL;
    },
    
    /*
     * Returns a basic object containing all the profile names,
     * indexed numerically from 0. The custom profile is also included
     * and is indexed with 'custom' instead of a number.
     */
    getProfileLabels: function() {
        var labels = {};
        for (var i=0; i<Settings.profiles.length; i++) {
            labels[i] = Settings.getLabel(i);
        }
        if (!Settings.lockedInMode) {
            labels['custom'] = Settings.getLabel('custom');
        }
        
        return labels;
    }
    
};