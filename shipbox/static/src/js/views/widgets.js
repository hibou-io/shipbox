odoo.define('shipbox.widgets', function (require) {
"use strict";

var ajax = require('web.ajax');
var core = require('web.core');
var crash_manager = require('web.crash_manager');
var data = require('web.data');
var datepicker = require('web.datepicker');
var dom_utils = require('web.dom_utils');
var Priority = require('web.Priority');
var ProgressBar = require('web.ProgressBar');
var Dialog = require('web.Dialog');
var common = require('web.form_common');
var formats = require('web.formats');
var framework = require('web.framework');
var Model = require('web.DataModel');
var pyeval = require('web.pyeval');
var session = require('web.session');
var utils = require('web.utils');

var fields = require('web.form_widgets');
var columns = require('web.ListView');

var Chatter = require('mail.Chatter');
var chat_manager = require('mail.chat_manager');
var web_utils = require('web.utils');

var shipbox = require('shipbox.core');


var _t = core._t;
var QWeb = core.qweb;

var scale = shipbox.Scale;

var FieldScale = fields.FieldFloat.extend({
    template: 'FieldScale',
    scale_reading: 0.0,
    initialize_content: function() {
        if(!this.get('effective_readonly') && !this.$input) {
            this.$input = this.$el.find('input');
        }
        this.setupFocus(this.$el);
    },
    start: function() {
        var tmp = this._super();
        var self = this;
        this.$el.find('.shipbox_scale').click(function(){
            self.set_value(self.scale_reading);
            self.focus();
        });
        this.update_scale();
        return tmp;
    },
    update_scale: function() {
        this.scale_reading = scale.get_scale_reading();
        this.render_scale_value();
        this.timer = setTimeout(this.update_scale.bind(this), scale.speed);
    },
    render_value: function() {
        this._super();
    },
    render_scale_value: function() {
        if (this.scale_reading) {
            this.$el.find('.shipbox_scale').show();
        }
        this.$el.find('.shipbox_scale_reading').text(this.scale_reading);
    },
    destroy: function() {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this._super();
    },
});

var ColumnScale = columns.Column.extend({
    format: function (row_data, options) {
        var content = this._super(row_data, options);
        return content + ' From Scale: <span class="shipbox_scale_reading_auto"></span>';
    }
});

var LabelChatter = Chatter.extend({
    fetch_and_render_thread: function (ids, options) {
        var self = this;
        options = options || {};
        options.ids = ids;

        // Ensure that only the last loaded thread is rendered to prevent displaying the wrong thread
        var fetch_def = this.dp.add(chat_manager.get_messages(options));

        // Empty thread and display a spinner after 1s to indicate that it is loading
        this.thread.$el.empty();
        web_utils.reject_after(web_utils.delay(1000), fetch_def).then(function () {
            self.thread.$el.append(QWeb.render('Spinner'));
        });

        return fetch_def.then(function (raw_messages) {
            console.log('ScaleChatter Messages: ');
            console.log(raw_messages);
            raw_messages.forEach(function(message){
                var time_diff = moment().diff(message.date, 'seconds');
                if (time_diff < 10 && time_diff > -1) {
                    shipbox.LabelPrinter.print_message(message);
                }
            });
            self.thread.render(raw_messages, {display_load_more: raw_messages.length < ids.length});
            $('.o_attachment').click(function (e) {
                e.preventDefault();
                var $this = $(this);
                var attachment = {
                    'url': $this.find('a').attr('href'),
                    'filename': $this.attr('title'),
                    'name': $this.attr('title'),
                    'mimetype': $this.find('a').attr('data-mimetype'),
                };
                shipbox.LabelPrinter.download_and_print(attachment);
            })
        });
    },
});

core.form_widget_registry
    .add('scale', FieldScale)
    .add('label_mail_thread', LabelChatter);

core.list_widget_registry
    .add('field.scale', ColumnScale);

return {
    FieldScale: FieldScale,
    ColumnScale: ColumnScale,
};

});
