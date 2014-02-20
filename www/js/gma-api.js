/************************************************************************/
/**
 * @class GMA
 * Joshua Chan <joshua@appdevdesigns.net>
 *
 *  Dependencies:
 *    - jQuery
 *    - async
 *        
 */

var GMA = function (opts) {
    var defaults = {
        gmaBase: 'http://gma.example.com/',
        casURL: 'https://signin.example.com/cas',
        showBusyAnim: function() {},
        hideBusyAnim: function() {},
        reloginCallback: null
    };
    this.opts = $.extend(defaults, opts);

    this.isLoggedIn = false;
    this.renId = null;
    this.GUID = null;
    this.isLoading = 0;
}



/**
 * Wrapper for jQuery.ajax(), used internally
 */
GMA.prototype.request = function (opts) {
    if (!opts.noAnimation) {
        this.opts.showBusyAnim();
        this.isLoading += 1;
    }
    
    var self = this;
    var dfd = $.Deferred();
    
    var isParseError = function (err) {
        if (!err.message) {
            return false;
        }
        if (err.message.match(/parse error|unexpected end of input/i)) {
            return true;
        }
        return false;
    };
    
    $.ajax({
        url: self.opts.gmaBase + opts.path,
        method: opts.method,
        data: (typeof opts.data != 'undefined') ?
                JSON.stringify(opts.data) : opts.data,
        dataType: opts.dataType || 'json',
        contentType: 'application/json',
        cache: false
    })
    .always(function(){
        if (!opts.noAnimation) {
            self.isLoading -= 1;
            if (self.isLoading <= 0) {
                self.opts.hideBusyAnim();
            }
        }
    })
    .fail(function(res, status, err){
        if (isParseError(err)) {
            // JSON parse error usually means the session timed out and
            // the Drupal site has redirected to the CAS login page
            // instead of serving up a JSON response.
            if (self.opts.reloginCallback) {
                opts.reloginCallback()
                .then(function(){
                    // Resend the request
                    self.request(opts)
                    .then(function(res, status, err){
                        dfd.resolve(res, status, err);
                    });
                })
                .fail(function(err){
                    console.log("Relogin failed", err);
                });
            } else {
                // Deliver a hopefully more helpful error
                console.log("Session timeout?", err);
                dfd.reject(res, status, new Error("Login session timed out"));
            }
        }
        else {
            dfd.reject(res, status, err);
        }
    })
    .then(function(data, status, res){
        dfd.resolve(data, status, res);
    });

    return dfd;
}


GMA.clearCookies = function () {
    var cookie = document.cookie.split(';');
    for (var i = 0; i < cookie.length; i++) {
        var chip = cookie[i],
            entry = chip.split("="),
            name = entry[0];
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    }
}


/**
 * @function login
 *
 * Uses the CAS RESTful interface to log in to the GMA site.
 * Further requests to GMA will be authenticated because of the browser
 * cookie used by jQuery.ajax().
 *
 * @param string username
 * @param string password
 * @return jQuery Deferred
 */
GMA.prototype.login = function (username, password) {
    var tgt;
    var st;
    var dfd = $.Deferred();
    var self = this;
    var gmaHome = self.opts.gmaBase + '?q=node';
    //var gmaHome = self.opts.gmaBase + 'index.php?q=en/node';
    //var gmaHome = self.opts.gmaBase + '?q=node&destination=node';
    //var gmaHome = self.opts.gmaBase + '?q=gmaservices&destination=gmaservices';
    
    self.opts.showBusyAnim();
    GMA.clearCookies();
    async.series([
        
        // Step 0: Make sure we are not already logged in
        function(next){
            if (self.isLoggedIn) {
                console.log("Logging out first to reset session");
                self.logout()
                .then(function(){ next() });
            } else {
                next();
            }
        },
        // Step 1: Get the TGT
        function(next){
            $.ajax({
                url: self.opts.casURL + "/v1/tickets",
                method: "POST",
                cache: false,
                data: { username: username, password: password }
            })
            .then(function(data, textStatus, res){
                tgt = res.getResponseHeader('Location');
                next();
            })
            .fail(function(res, textStatus, err){
                console.log(err);
                if (err instanceof Error) {
                    if (!err.message) {
                        err.message = "[" + textStatus + ": " + res.status + "]";
                    }
                    next(err);
                } else {
                    var message = 'Unexpected result from login server';
                    switch (parseInt(res.status)) {
                        case 404: 
                            message = 'Make sure your VPN and server settings are correct'; 
                            break;
                        case 400:
                            message = 'Credentials were not accepted';
                            break;
                        default:
                            message = textStatus + ': ' + res.status;
                            break;
                    }
                    next(new Error(message));
                }
            });
        },
        // Step 2: Get the ST
        function(next){
            $.ajax({
                url: tgt,
                method: "POST",
                //data: { service: gmaHome }
                data: "service=" + gmaHome,
                processData: false
            })
            .then(function(data, textStatus, res){
                // Credentials verified by CAS server. We now have the
                // service ticket.
                st = data;
                next();
            })
            .fail(function(res, textStatus, err){
                next(err);
            });
        },
        // Step 3: Log in to GMA
        function(next){
            var finalURL = gmaHome + 
                (gmaHome.match(/[?]/) ? "&" : '?') + 
                "ticket=" + st;
            $.ajax({
                url: finalURL,
                method: "GET"
            })
            .then(function(data, textStatus, res){
                if (data.match(/CAS Authentication failed/)) {
                    // Authentication problem on the Drupal site
                    next(new Error("Sorry, there was a problem authenticating with the server"));
                } else {
                    next();
                }
            })
            .fail(function(res, textStatus, err){
                next(err);
            });
        },
        // Step 4: Get user info
        function(next){
            self.getUser()
            .then(function(){ next() })
            .fail(function(err){
                // We have logged in to the GMA Drupal site
                // but the user doesn't have access to the GMA system there.
                // Log out of the Drupal site.
                self.logout();
                next(err);
            });
        }

    ], function(err){
        self.opts.hideBusyAnim();
        if (err) {
            // All failures from above are caught here
            dfd.reject(err);
        } else {
            dfd.resolve();
        }
    });
    
    return dfd;
}


/**
 * @function getUser
 *
 * @return jQuery Deferred
 *      resolves with parameter `ren` {
 *          renId: int,
 *          renPreferredName: string,
 *          GUID: string
 *      }
 */
GMA.prototype.getUser = function () {
    var dfd = $.Deferred();
    var self = this;
    var servicePath = '?q=gmaservices/gma_user&type=current';
    
    self.request({
        path: servicePath,
        method: 'GET'
    })
    .then(function(data, textStatus, res){
        if (data.success) {
            var ren = data.data[0];
            self.preferredName = ren.preferredName;
            self.renId = ren.renId;
            self.GUID = ren.GUID;
            dfd.resolve(ren);
        }
        else {
            var err = new Error(data.error.errorMessage);
            err.origin = servicePath;
            dfd.reject(err);
        }
    })
    .fail(function(res, textStatus, err){
        dfd.reject(err);
    });
    
    return dfd;
}


/** 
 * @function getAssignments
 *
 * Delivers the GMA nodes that the user is assigned to.
 * 
 * @return jQuery Deferred
 *      resolves with two parameters
 *      - assignmentsByID { 101: "Assign1", 120: "Assign2", ... }
 *      - assignmentsByName { "Assign1": 101, "Assign2": 120, ... }
 */
GMA.prototype.getAssignments = function () {
    var dfd = $.Deferred();
    var self = this;
    var servicePath = '?q=gmaservices/gma_user/' + self.renId + '/assignments/staff';
    
    self.request({
        path: servicePath,
        method: 'GET'
    })
    .then(function(data, textStatus, res){
        if (data.success) {
            // Create two basic lookup objects indexed by nodeId and by name
            var assignmentsByID = {};
            var assignmentsByName = {};
            if (data.data['staff']) {
                for (var i=0; i<data.data.staff.length; i++) {
                    var nodeId = data.data.staff[i].nodeId;
                    var shortName = data.data.staff[i].shortName;
                    assignmentsByID[nodeId] = shortName;
                    assignmentsByName[shortName] = nodeId;
                }
            }
            dfd.resolve(assignmentsByID, assignmentsByName);
        } else {
            var err = new Error(data.error.errorMessage);
            err.origin = servicePath;
            dfd.reject(err);
            console.log(data);
        }
    })
    .fail(function(res, textStatus, err){
        dfd.reject(err);
    });
    
    return dfd;
}



/** 
 * @function getReportsForNode
 *
 * Delivers an array of up to ten Report objects for reports within 
 * the specified node.
 *
 * @param int nodeId
 * @return jQuery Deferred
 */
GMA.prototype.getReportsForNode = function (nodeId) {
    var dfd = $.Deferred();
    var self = this;
    var servicePath = '?q=gmaservices/gma_staffReport/searchOwn';
    
    self.request({
        path: servicePath,
        method: 'POST',
        data: {
            nodeId: [nodeId],
            maxResult: 10
            //submitted: false
        }
    })
    .then(function(data, textStatus, res){
        if (data.success) {

            if (!data.data.staffReports) {
                dfd.reject(new Error("No reports available"));
            }
            else {
                var reports = [];
                for (var i=0; i<data.data.staffReports.length; i++) {
                    var reportId = data.data.staffReports[i].staffReportId;
                    var nodeName = data.data.staffReports[i].node.shortName;
                    reports.push(new Report({
                        gma: self,
                        reportId: reportId, 
                        nodeId: nodeId, 
                        nodeName: nodeName,
                        startDate: data.data.staffReports[i].startDate,
                        endDate: data.data.staffReports[i].endDate
                    }));
                }
                dfd.resolve(reports);
            }
        
        } else {
            var err = new Error(data.error.errorMessage);
            err.origin = servicePath;
            dfd.reject(err);
            console.log(data);
        }
    })
    .fail(function(res, textStatus, err){
        dfd.reject(err);
    });
    
    return dfd;
}



/** 
 * @function logout
 *
 * Logs out of the Drupal website that GMA is on.
 *
 * @return jQuery Deferred
 */
GMA.prototype.logout = function () {
    var dfd = $.Deferred();
    var self = this;
    
    self.request({
        path: '?q=logout',
        method: 'HEAD',
        dataType: 'html'
    })
    .then(function(){
        self.isLoggedIn = false;
        self.renId = null;
        self.GUID = null;
        dfd.resolve();
    })
    .fail(function(res, status, err){
        dfd.reject(err);
    });
    
    return dfd;
}



/************************************************************************/
/**
 * @class Report
 */
 
var Report = function(data) {
    
    this.gma = data.gma;

    this.reportId = data.reportId;
    this.nodeId = data.nodeId;
    this.nodeName = data.nodeName;
    this.startDate = data.startDate;
    this.endDate = data.endDate;
    
}


/**
 * @function measurements
 *
 * Delivers a bunch of Measurement objects in this format:
 * {
 *     "Strategy Name 1": [
 *          Measurement1.1,
 *          Measurement1.2,
 *          ...
 *      ],
 *      "Strategy Name 2": [
 *          Measurement2.1,
 *          Measurement2.2,
 *          ...
 *      ],
 *      ...
 * }
 *
 * @return jQuery Deferred
 */
Report.prototype.measurements = function () {
    var dfd = $.Deferred();
    var self = this;
    var servicePath = '?q=gmaservices/gma_staffReport/' + self.reportId + '/numeric';
    
    self.gma.request({
        path: servicePath,
        method: 'GET'
    })
    .then(function(data, textStatus, res) {
        if (data.success) {
            
            // Parse through the layers of JSON structure
            // and make our own structure that suits us better.
            var results = {};
            
            var numerics = data.data.numericMeasurements;
            // 1st layer is an array of objects
            for (var i=0; i<numerics.length; i++) {
                var strategy = numerics[i];
                // 2nd layer is an object with a single property
                for (var strategyName in strategy) {
                    var measurements = strategy[strategyName];
                    results[strategyName] = [];
                    // 3rd layer is an array of objects
                    for (var j=0; j<measurements.length; j++) {
                        var info = measurements[j];
                        results[strategyName].push(
                            new Measurement({
                                gma: self.gma,
                                reportId: self.reportId,
                                measurementId: info.measurementId,
                                measurementName: info.measurementName,
                                measurementDescription: info.measurementDescription,
                                measurementValue: info.measurementValue
                            })
                        );
                    }
                }
            }
            
            dfd.resolve(results);
            
        } else {
            var err = new Error(data.error.errorMessage);
            err.origin = servicePath;
            dfd.reject(err);
        }
    })
    .fail(function(res, textStatus, err) {
        dfd.reject(err);
    });
    
    return dfd;
}

Report.formatDate = function (ymd) {
    return ymd.substr(0, 4) + '-'
         + ymd.substr(4, 2) + '-'
         + ymd.substr(6, 2);
}


Report.prototype.period = function () {
    /*
    var dfd = $.Deferred();
    dfd.resolve(this.startDate);
    return dfd;
    */
    
    return Report.formatDate(this.startDate)
            + ' &ndash; '
            + Report.formatDate(this.endDate);
}



/************************************************************************/
/**
 * @class Measurement
 *
 * A measurement is unique to a particular report.
 */

var Measurement = function (data) {
    this.gma = data.gma;
    delete data.gma;
    
    var defaults = {
        reportId: 0,
        measurementId: 0,
        measurementName: "Measurement",
        measurementDescription: "This is a GMA measurement",
        measurementValue: 0
    };
    this.data = $.extend(defaults, data);

    this.timer = null;
    this.pendingDFD = null;
}

Measurement.timeout = 3000; // 3 seconds for delayed save operation

Measurement.prototype.label = function () {
    return this.data.measurementName;
}

Measurement.prototype.id = function () {
    return this.data.measurementId;
}

Measurement.prototype.value = function (val) {
    if (typeof val != 'undefined') {
        return this.data.measurementValue = val;
    } 
    return this.data.measurementValue;
}

/**
 * Wait a few seconds before saving the measurement value to the server.
 * Any new delayed save operations within that time will replace this one.
 */
Measurement.prototype.delayedSave = function () {
    var self = this;
    var dfd = $.Deferred();
    
    // Cancel any previous delayed save requests
    if (self.timer) {
        clearTimeout(self.timer);
        self.timer = null;
        // Cancelling is an expected behaviour and not an error
        self.pendingDFD.resolve("Cancelled");
    }
    
    self.pendingDFD = dfd;
    self.timer = setTimeout(function(){
        // The actual save is done here once the time comes
        self.save()
        .then(function(){
            dfd.resolve();
        })
        .fail(function(err){
            dfd.reject(err);
        });
    }, Measurement.timeout);
    
    return dfd;
}

/**
 * Save the measurement's value to the server immediately.
 */
Measurement.prototype.save = function () {
    var dfd = $.Deferred();
    var self = this;
    var servicePath = '?q=gmaservices/gma_staffReport/'+ self.data.reportId;

    self.gma.request({
        noAnimation: true,
        path: servicePath,
        method: 'PUT',
        data: [
            {
                measurementId: self.data.measurementId,
                type: 'numeric',
                value: self.data.measurementValue
            }
        ]
    })
    .then(function(data, status, res) {
        if (data.success) {
            dfd.resolve();
        } else {
            var err = new Error(data.error.errorMessage);
            err.origin = "PUT " + servicePath;
            dfd.reject(err);
        }
    })
    .fail(function(res, status, err) {
        dfd.reject(err);
    });
    
    return dfd;
}

