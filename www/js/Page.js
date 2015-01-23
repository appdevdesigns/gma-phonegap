/************************************************************************/
/**
 * @class Page
 * Joshua Chan <joshua@appdevdesigns.net>
 *
 *  Dependencies:
 *    - jQuery
 */
var Page = function($elem) {
    this.$elem = $elem;
    this.id = $elem.attr('id');
    
    // Add this Page to the static list of all instances
    Page.list[this.id] = this;
    
    // Attach a reference to this Page object in the element
    $elem.data('Page', this);
};

// Static shortcut function for initializing all .page DIVs
Page.init = function () {
    $('.page').each(function(){
        var $this = $(this);
        var obj = new Page($this);
        $this.data('Page', obj);
    });
}

// Static class properties
Page.list = {
/*
    // Indexed by the DOM element ID
    "login-page": ... ,
    "custom-settings-page": ...,
    ...
*/
};
Page.stack = [];

/**
 * Hide all other pages and show this one.
 */
Page.prototype.show = function(){
    for (var pageName in Page.list) {
        Page.list[pageName].$elem.removeClass('visible-page');
    }
    this.$elem.addClass('visible-page');
};

// Display a page while keeping track of previous pages underneath
Page.prototype.push = function(){
    if (Page.stack[Page.stack.length-1] != this) {
        Page.stack.push(this);
    }
    this.show();
};

// Dismiss the current Page at the top of the stack and reveal the previous one
Page.pop = function(){
    if (Page.stack.length > 1) {
        Page.stack.pop();
        Page.stack[Page.stack.length-1].show();
    }
};

// Pop back to the original page
Page.popAll = function(){
    if (Page.stack.length > 1) {
        Page.stack.splice(1, Page.stack.length-1);
        Page.stack[0].show();
    }
};

