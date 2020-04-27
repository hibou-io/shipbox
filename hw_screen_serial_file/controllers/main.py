import serial.tools.list_ports
from openerp.addons.hw_screen.controllers import main as homepage


class HardwareScreenCups(homepage.HardwareScreen):

    def _get_html(self):
        res = super(HardwareScreenCups, self)._get_html()
        #res = res.replace('Odoo Point of Sale', 'Odoo Point of Sale <em>with Hibou ShipBox</em>')

        ports = [d.device for d in serial.tools.list_ports.comports()]
        pre = '<pre>' + '<br/>'.join(ports) + '</pre>'
        res = res.replace('<h3>My IPs</h3>', '<h3>My Serial Ports</h3>' + pre + '<h3>My IPs</h3>')

        return res
