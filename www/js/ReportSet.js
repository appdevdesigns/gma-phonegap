/************************************************************************/
/**
 * @class ReportSet
 * Joshua Chan <joshua@appdevdesigns.net>
 *
 *  Dependencies:
 *    - gma-api.js
 *    - jQuery
 */
 
/**
 * @function constructor
 * @param array reports
 *      An array of Report objects
 */
var ReportSet = function(reports) {
    this.reports = reports;
    this.currentIndex = 0;
};

/** 
 * @function get
 *
 * Returns one report from the report set.
 *
 * @param int index
 * @return Report
 */
ReportSet.prototype.get = function (index) {
    if (typeof index == 'undefined') {
        index = this.currentIndex;
    }
    if (this.reports.length < 1 || index < 0 || index >= this.reports.length) {
        return false;
    }
    this.currentIndex = index;
    return this.reports[index];
}

ReportSet.prototype.next = function () {
    return this.get( this.currentIndex+1 );
}

ReportSet.prototype.prev = function () {
    return this.get( this.currentIndex-1 );
}