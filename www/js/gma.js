/**
 * This is the app controller for Mobile GMA.
 *
 * Dependencies:
 *      - jQuery
 *      - gma-api.js
 *      - language.js
 *      - Settings.js
 *      - Page.js
 *      - ReportSet.js
 */

// Global GMA object to be initialized at login
var gma;


// Use PhoneGap's notification API if available
var _alert = function (message, title) {
    if (navigator.notification) {
        navigator.notification.alert(
            t(message),
            function() {},
            t(title || "Notice"),
            t("OK")
        );
    } else {
        if (title) {
            message = t(title) + ':\n' + t(message);
        }
        alert(message);
    }
 };

// Handler for GMA service call errors
var errorHandler = function (err) {
    console.log(err);
    
    // On session timeout, reset back to the login page
    if (err && err.message && err.message.match(/session timed out/i)) {
        _alert("Please log in again", 'Session timed out');
        Page.popAll();
    }
    else if (err && err.message) {
        _alert(err.message, 'Error');
    }
    else if (typeof err == "string") {
        _alert(err, 'Error');
    }
    else {
        _alert("Sorry, there was an error");
    }
}



var startGMA = function () {
    
    // Load the version info
    $.ajax({
        url: 'config.xml',
        type: 'GET',
        dataType: 'xml'
    })
    .done(function(data){
        var version = $(data).find('widget').attr('version');
        $('#version').text(version);
    });
    
    // Show the first page
    Page.init();
    Page.list['login-page'].push();

    
    ///////////////////////////////
    //    CUSTOM SETTINGS PAGE   //
    ///////////////////////////////
    
    // Handle the "Next" button
    $('#custom-settings-page button').on('click', function(){
        Settings.setCustomProfile({
            gmaBase: $('#custom-gma-server').val(),
            casURL: $('#custom-cas-server').val(),
            label: 'Custom server'
        });
        
        // Dismiss and to return to the login page
        Page.pop();
    });



    /////////////////////
    //    LOGIN PAGE   //
    /////////////////////
    
    var populateServerList = function () {
        var $serverList = $('#gma-server-list');
        var profiles = Settings.getProfileLabels();
        $serverList.empty();
        for (var key in profiles) {
            $serverList.append(
                '<option value="' + key + '">' +
                t(profiles[key]) +
                '</option>'
            );
        }
        if (Settings.lockedInMode) {
            $serverList.parents('.ui-select').hide();
            $('#locked-in-server')
                .text( Settings.getLabel() )
                .show();
        } else {
            $('#locked-in-server').hide();
            $serverList.parents('.ui-select').show();
            $serverList.selectmenu("refresh");
        }
    };
    populateServerList();
    
    // Swipe the "Server" label right to re-fetch the list of servers
    var $server = $("#login-page label[for='gma-server-list']");
    $server.on('swiperight', function(){
        $server.animate({
            paddingLeft: 40
        });
        $.mobile.loading('show');
        Settings.fetchProfiles()
        .always(function(){
            $.mobile.loading('hide');
            $server.animate({
                paddingLeft: 0
            });
        })
        .done(function(){
            populateServerList();
        });
    });
    
    
    // Handle swipes to the server text when in "locked in" mode
    $('#locked-in-server').on('swiperight', function(){
        var $serverList = $('#gma-server-list');
        var currentIndex = $serverList.get(0).selectedIndex;
        if (currentIndex < $serverList.children().length - 1) {
            $serverList.get(0).selectedIndex += 1;
            $serverList.trigger('change');
        }
    });
    $('#locked-in-server').on('swipeleft', function(){
        var $serverList = $('#gma-server-list');
        var currentIndex = $serverList.get(0).selectedIndex;
        if (currentIndex > 0) {
            $serverList.get(0).selectedIndex -= 1;
            $serverList.trigger('change');
        }
    });
    
    
    // Update the Settings object when a profile is chosen
    $('#gma-server-list').on('change', function(){
        var profileKey = $(this).val();
        Settings.currentProfile = profileKey;
        $('#locked-in-server').text( Settings.getLabel() );

        // Show the custom settings page when "Custom..." is selected from the list        
        if (profileKey == 'custom') {
            Page.list['custom-settings-page'].push();
        }
    });


    // Logging in
    $('#login-button').on('click', function(){
        // Disable widgets while communicating with server
        $('#login-page').find('input,button,select').attr('disabled', 'true');

        // Init the GMA object based on the selected profile
        gma = new GMA({
            gmaBase: Settings.getGmaBase(),
            casURL: Settings.getCasUrl(),
            showBusyAnim: function(){
                $.mobile.loading("show");
            },
            hideBusyAnim: function(){
                $.mobile.loading("hide");
            }
        });
        
        gma.login($('#cas-username').val(), $('#cas-password').val())
        .fail(function(err){
            _alert(err.message || '', 'Login failure');
        })
        .always(function(){
            // Re-enable widgets when done
            $('#login-page').find('input,button,select').removeAttr('disabled');
        })
        .then(function(){
            // Return to previous page, if there is one
            if (Page.stack.length > 1) {
                Page.pop();
            }
            // Otherwise move on to the Assignments page
            else {
                
                // Populate the assignment list
                showAssignments();
                
            }
            // Clear the password field
            $('#cas-password').val('');
        });
        
    });
    
    
    

    //////////////////////////////
    //    ASSIGNMENTS PAGE     //
    /////////////////////////////
    
    var reports;
    var assignments = {
        staff: {},
        staffCount: 0,
        director: {},
        directorCount: 0
    };
    var currentRole = 'staff';
    var oldRole = 'director';
    
    // Fetch assignment data from GMA server and update local variables.
    // Called by showAssignments()
    var fetchAssignments = function () {
        var dfd = $.Deferred();
        $.when( gma.getAssignments('staff'), gma.getAssignments('director') )
        .fail(function(staffErr, directorErr){
            dfd.reject(staffErr || directorErr);
        })
        .done(function(staffResults, directorResults){
            assignments.staff = staffResults[0];
            assignments.staffCount = staffResults[2].length;
            assignments.director = directorResults[0];
            assignments.directorCount = directorResults[2].length;
            dfd.resolve();
        });
        return dfd;
    };
    
    // Populate the on-screen list
    // Called by showAssignments();
    var populateList = function (role) {
        var $list = $('#assignments-page ul');
        $list.empty();
        
        currentRole = role;
        if (role == 'staff') { 
            oldRole = 'director'; 
        } else { 
            oldRole = 'staff'; 
        }

        // Change button label
        $('#assignment-toggle')
            .text( t(oldRole) )
            .addClass(oldRole)
            .removeClass(currentRole);
        // Change container color to reflect current role
        $('.container')
            .addClass('container-' + currentRole)
            .removeClass('container-' + oldRole);
        // Change header label
        $('#assignments-page h1').html(t(currentRole+' reports'))
        
        var assignmentsByID = assignments[role];
        for (var nodeID in assignmentsByID) {
            var nodeName = assignmentsByID[nodeID];
            $list.append('<li><a href="#" node-id="' + nodeID + '">' + nodeName + '</a></li>');
        }
        $list.listview('refresh');
    };
    
    
    var showAssignments = function () {
        fetchAssignments()
        .fail(errorHandler)
        .done(function() {
            if (assignments.staffCount + assignments.directorCount == 0) {
                errorHandler(new Error("No assignments found"));
            }
            else {
                if (Math.min(assignments.staffCount, assignments.directorCount) > 0) {
                    // Both roles have assignments. Reveal the toggle button.
                    $('#assignment-toggle').show();
                } else {
                    $('#assignment-toggle').hide();
                }
                
                if (assignments.staffCount == 0) {
                    // If they only have director role
                    populateList('director');
                }
                else {
                    // If they have both roles, or only staff role
                    populateList('staff');
                }
                
                Page.list['assignments-page'].push();
            }
        });
    }
    
    
    // Handle the toggle button
    $('#assignment-toggle').on('click', function(){
        populateList(oldRole);
    });

    
    // Handle the logout button
    $('#logout').on('click', function(){
        gma.logout()
        .fail(errorHandler)
        .always(function(){
            Page.popAll();
        });
    });
    
    
    // Handle clicks to an Assignment item
    $('#assignments-page ul').on('click', 'li a', function(ev){
        var $node = $(this);
        var id = $node.attr('node-id');
        var name = $node.text();
        
        // Populate the stats list
        gma.getReportsForNode(id, currentRole)
        .fail(errorHandler)
        .then(function(results){
            if (results.length > 0) {
                reports = new ReportSet(results);
                showReport( reports.get() );
            }
            else {
                errorHandler(new Error("No reports available"));
            }
        });
    });
    
    

    /////////////////////////////
    //    STATS ENTRY PAGE     //
    /////////////////////////////
    
    /**
     * Populates the stats entry page with a given report
     * @param report Report
     */
    var showReport = function (report) {
        if (!report) {
            return;
        }
    
        var $list = $('#stats-page ul.measurements');
        
        $('#stats-page #report-name').html(report.nodeName);
        $('#stats-page #report-date').html(report.period());
        $list.empty();
        
        report.measurements()
        .fail(errorHandler)
        .then(function(measurements){
            for (var strategy in measurements) {
                // Add a list divider for each strategy
                $list.append('<li data-role="list-divider">' + strategy + '</li>');
                for (var i=0; i<measurements[strategy].length; i++) {
                    var m = measurements[strategy][i];
                    var label = m.label();
                    var id = m.id();
                    var value = m.value();
                    // Create a <LI> element to hold the measurement row
                    var $row = $(
                        '<li class="ui-field-contain ui-btn ui-btn-icon-right ui-icon-plus">'
                            + '<label>' + label + '</label>'
                            + '<input pattern="[0-9]" type="tel" value="' + value + '">'
                        + '</li>'
                    );
                    // Attach the Measurement object to the row
                    $row.data('Measurement', m);
                    // Insert the row into the DOM
                    $list.append($row);
                }
            }
            $list.listview('refresh');
            // Show the stats page
            Page.list['stats-page'].push();
        });
        
    };
    
    // Clicking on the Back button will dismiss the stats page
    $('#stats-page #report-back').on('click', function(){
        Page.pop();
    });
    
    // Clicking on the row will auto increment the measurement value
    $('#stats-page ul').on('click', 'li', function(){
        var $li = $(this);
        var $input = $li.find('input');
        var value = parseInt($input.val());
        if ($li.hasClass('ui-icon-plus')) {
            value += 1;
        } 
        else if ($li.hasClass('ui-icon-minus') && value > 0) {
            value -= 1;
        } 
        $input.val(value);
        $input.trigger('change');
    });
    
    // Prevent the auto increment if the user was tapping on the textbox to
    // manually enter a value
    $('#stats-page ul').on('click', 'li input', function(ev){
        ev.stopPropagation();
    });
    
    // Swipe left to toggle plus or minus
    $('#stats-page ul').on('swipeleft', 'li', function(){
        var $li = $(this);
        var $input = $li.find('input');
        var oldMargin = $li.css('marginRight');
        var oldTextWidth = $input.width();
        $input.width('1');
        $input.css('visibility', 'hidden'); // invisible, but still present
        $li.animate({ marginRight: '1em' }, function(){
            $li.toggleClass('ui-icon-plus');
            $li.toggleClass('ui-icon-minus');
            $li.animate({ marginRight: oldMargin }, function(){
                $input.width(oldTextWidth);
                $input.css('visibility', 'visible');
            });
        });
    });
    
    
    // Update the server when value changes
    $('#stats-page ul').on('change', 'li input', function(ev){
        var $row = $(this).parent();
        var val = $(this).val();
        var measurement = $row.data('Measurement');
        measurement.value( val );
        measurement.delayedSave().fail(errorHandler);
    });
    
    
    // Switch to a different report period when the arrow button is clicked
    $('#stats-page a.report-nav').on('click', function(){
        var $this = $(this);
        // The reports list is ordered most recent first.
        // So clicking on the "Next" button should show the previous
        // report chronologically, although it is the next report in the list.
        if ($this.hasClass('report-previous')) {
            showReport( reports.next() );
        } else {
            showReport( reports.prev() );
        }
    });
    
    
    // Show a pop-up with the measurement description when the user taps and 
    // holds on a measurement.
    $('#stats-page ul').on('taphold', 'li', function(){
        var $row = $(this);
        var measurement = $row.data('Measurement');
        var name = measurement.label();
        var description = measurement.data.measurementDescription;
        
        var $popup = $('#measurement-description');
        $popup.html(
            '<h3>' + name + '</h3>' +
            description
        );
        $popup.popup('open');
    });
    
    
};

