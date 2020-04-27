import logging
import time
from base64 import b64decode
from threading import Thread, Lock
from time import sleep
import serial
import serial.tools.list_ports

from openerp import http

import openerp.addons.hw_proxy.controllers.main as hw_proxy

_logger = logging.getLogger(__name__)

DRIVER_NAME = 'serial_file'


class SerialFileThread(Thread):
    def __init__(self):
        Thread.__init__(self)
        self.lock = Lock()
        self.status = {'status': 'connecting', 'messages': []}
        self.port = None
        self.ports = None
        self.bytesizes = {
            'FIVEBITS': serial.FIVEBITS,
            'SIXBITS': serial.SIXBITS,
            'SEVENBITS': serial.SEVENBITS,
            'EIGHTBITS': serial.EIGHTBITS,
        }
        self.parities = {
            'PARITY_NONE': serial.PARITY_NONE,
            'PARITY_EVEN': serial.PARITY_EVEN,
            'PARITY_ODD': serial.PARITY_ODD,
            'PARITY_MARK': serial.PARITY_MARK,
            'PARITY_SPACE': serial.PARITY_SPACE,
        }
        self.stopbits = {
            'STOPBITS_ONE': serial.STOPBITS_ONE,
            'STOPBITS_ONE_POINT_FIVE': serial.STOPBITS_ONE_POINT_FIVE,
            'STOPBITS_TWO': serial.STOPBITS_TWO,
        }

    def lockedstart(self):
        with self.lock:
            if not self.isAlive():
                self.daemon = True
                self.start()

    def set_status(self, status, message=None):
        if status == self.status['status']:
            if message is not None and message != self.status['messages'][-1]:
                self.status['messages'].append(message)
                if status == 'error':
                    _logger.error('Serial File Error: ' + str(message))
        else:
            self.status['status'] = status
            if message:
                self.status['messages'] = [message]
            else:
                self.status['messages'] = []

            if status == 'error' and message:
                _logger.error('Serial File Error: ' + str(message))

    def get_port(self):
        if self.port:
            return self.port

        self.ports = [d.device for d in serial.tools.list_ports.comports()]
        for d in self.ports:
            if d.find('USB') >= 0:
                self.port = d
            if not self.port:
                # will get the first port, but will use the 'last' USB as default
                self.port = d
        return self.port

    def upload_file(self, payload):
        port = payload.get('port')
        if port and port not in self.devices:
            raise ValueError('Port "%s" not available on device.' % (port, ))
        if not port:
            port = self.get_port()

        # get serial parameters
        baudrate = int(payload.get('baudrate', 19200))
        bytesize = self.bytesizes[payload.get('bytesize', 'SEVENBITS')]
        parity = self.parities[payload.get('parity', 'PARITY_EVEN')]
        stopbits = self.stopbits[payload.get('stopbits', 'STOPBITS_ONE')]
        device = serial.Serial(port=port,
                               baudrate=baudrate,
                               bytesize=bytesize,
                               parity=parity,
                               stopbits=stopbits,
                               )
        data = b64decode(payload['data'])
        device.write(data)
        sleep(1)
        device.flush()
        del device

    def get_status(self):
        self.lockedstart()
        return self.status

    def run(self):
        self.ports = None
        self.port = None

        while True:
            if self.port:
                sleep(10)
            else:
                with self.lock:
                    self.get_port()
                    if self.port:
                        self.set_status('connected')
                if not self.port:
                    sleep(5)

serial_file_thread = SerialFileThread()
hw_proxy.drivers[DRIVER_NAME] = serial_file_thread


class SerialFileDriver(hw_proxy.Proxy):
    @http.route('/hw_proxy/serial_file', type='json', auth='none', cors='*')
    def serial_file(self, **payload):
        serial_file_thread.upload_file(payload)
