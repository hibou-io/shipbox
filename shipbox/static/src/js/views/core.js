odoo.define('shipbox.core', function (require) {
"use strict";

var ajax = require('web.ajax');
var core = require('web.core');
var Model = require('web.DataModel');
var ActionManager = require('web.ActionManager');

ActionManager.include({
    ir_actions_act_window_close: function (action, options) {
        console.log('Hello actions close!');
        if (action.shipbox_print) {
            if (action.shipbox_print.endpoint_url) {
                if (!printer_runner_container[action.shipbox_print.endpoint_url]) {
                    var new_runner = new PrinterRunner();
                    new_runner.endpoint_url = action.shipbox_print.endpoint_url;
                    new_runner.start();
                    printer_runner_container[action.shipbox_print.endpoint_url] = new_runner;
                }
                printer_runner_container[action.shipbox_print.endpoint_url].print(action.shipbox_print);
            } else {
                label_printer_runner.print(action.shipbox_print);
            }
        }
        return this._super(action, options);
    }
});

var _t = core._t;
var QWeb = core.qweb;

/*
This is the function that the Linea Pro iOS cases use to pass in
Barcode data to a webapp.
 */
window.BarcodeData = function(barcode, type, typeText) {
    core.bus.trigger('barcode_scanned', barcode, document);
};

// helper
var blobToBase64 = function(blob, callback) {
    var reader = new FileReader();
    reader.onload = function() {
        var dataUrl = reader.result;
        var base64 = dataUrl.split(',')[1];
        callback(base64);
    };
    reader.readAsDataURL(blob);
};

var printer_runner_container = {}
var endpoint_url = false;
var endpoint_name = '';
new Model("shipbox.endpoint").call("get_endpoint").then(function(response) {
    endpoint_url = response.url;
    endpoint_name = response.name;
    label_printer_runner.endpoint_url = endpoint_url;
    printer_runner_container[endpoint_url] = label_printer_runner;
});

var scale_runner = {
    scale_reading: 0.0,
    started: false,
    timer: false,
    connection_errors_count: 0,
    speed: 1000,

    get_scale_reading: function() {
        if (!this.started) {
            this.start();
        }
        return this.scale_reading;
    },
    start: function() {
        this.started = true;
        this.read_from_scale();
    },
    read_from_scale: function() {
        if (endpoint_url && this.connection_errors_count < 100) {
            var url = endpoint_url + '/hw_proxy/scale_read/';
            ajax.jsonRpc(url)
                .done(this.response_from_scale.bind(this))
                .fail(this.error_from_scale.bind(this))
                .always(this.setup_read_timer.bind(this));
        } else {
            this.setup_read_timer();
        }
    },
    response_from_scale: function(response) {
        var w = response.weight.toFixed(3);
        this.scale_reading = parseFloat(w);
        this.speed = 500;
        $('.shipbox_scale_reading_auto').text(this.scale_reading);
    },
    error_from_scale: function(error) {
        this.connection_errors_count += 1;
        this.speed = 1000;
        if (this.connection_errors_count > 10) {
            this.speed = 2000;
        } else if (this.connection_errors_count > 20) {
            this.speed = 5000;
        }
    },
    setup_read_timer: function() {
        this.timer = setTimeout(this.read_from_scale.bind(this), this.speed);
    },
};

var PrinterRunner = function(){
    this.endpoint_url = false;
    this.started = false;
    this._can_print_label = false;
    this._backlog = [];
    this.connection_errors_count = 0;
    this.start_wait_count = 0;

    this.can_print_label = function () {
        if (!this.started) {
            this.start();
            return false;
        }
        return this._can_print_label;
    }

    this.start = function () {
        this.started = true;
        if (!this.endpoint_url && this.start_wait_count < 10) {
            this.start_wait_count += 1;
            setTimeout(this.start.bind(this), 500);
        } else if (this.endpoint_url) {
            var url = this.endpoint_url + '/hw_proxy/status_json';
            ajax.jsonRpc(url)
                .done(this.response_status.bind(this))
                .fail(this.error_response_status.bind(this))
        }
    }

    this.response_status = function (response) {
        if (response && response.print_queue.status == 'connected') {
            this._can_print_label = true;
            if (this._backlog.length) {
                for (var i = 0; i < this._backlog.length; i++) {
                    this.print(this._backlog[i]);
                }
                this._backlog = [];
            }
        } else {
            this._can_print_label = false;
            this.start();
        }
    }

    this.error_response_status = function (response) {
        console.log(response);
        this.connection_errors_count += 1;
    }

    this.print = function (attachment) {
        if (this._can_print_label) {
            if (!attachment.data) {
                this.download_and_print(attachment);
                return;
            }
            var url = this.endpoint_url + '/hw_proxy/print_queue';
            ajax.jsonRpc(url, null, {'attachment': attachment})
                .done(this.print_response.bind(this))
                .fail(this.error_response_status.bind(this))
        } else {
            this._backlog.push(attachment);
        }
    }

    this.print_message = function (message) {
        //console.log('on_new_message');
        //console.log(message);
        var self = this;
        if (message.attachment_ids.length && this.can_print_label()) {
            for (var i = 0; i < message.attachment_ids.length; i++) {
                var attachment = message.attachment_ids[i];
                if (attachment.filename.indexOf('Label') >= 0) {
                    this.download_and_print(attachment);
                }
            }
        }
    }

    this.download_and_print = function (attachment) {
        var self = this;
        var req = new XMLHttpRequest();
        req.open("GET", attachment.url, true);
        req.responseType = "blob";
        req.onload = function (event) {
            var blob = req.response;
            blobToBase64(blob, function(b64data) {
                attachment.data = b64data;
                self.print(attachment);
            });
        };

        req.send();
    }

    this.print_response = function(response) {
        console.log(response);
    }

    return this;
};

var label_printer_runner = new PrinterRunner();
label_printer_runner.start();

var TEST = {
    'attachment_ids': [
        {
            mimetype: "application/octet-stream",
            id: 5344,
            name: "LabelFedex-787623177789.ZPLII",
            filename: "LabelFedex-787623177789.ZPLII",
            url: "/web/content/5344?download=true"
        }
    ]
};

//setTimeout(function(){label_printer_runner.print_message(TEST)}, 5000);



return {
    Scale: scale_runner,
    LabelPrinter: label_printer_runner,
};
});
