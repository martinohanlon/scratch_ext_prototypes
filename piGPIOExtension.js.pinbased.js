new (function() {
    var ext = this;
    var last_when = false;
    var net = require('net')
    var fs = require('fs')
    const {dialog} = require('electron').remote
    const {BrowserWindow} = require('electron').remote
    

    // Cleanup function when the extension is unloaded
    ext._shutdown = function ()
    {
        var cpu = fs.readFileSync ("/proc/cpuinfo", 'utf8');
        if (cpu.indexOf ("ARM") != -1)
        {
            for (pin = 2; pin < 28; pin++)
            {
                if (fs.existsSync("/sys/class/gpio/gpio" + pin))
                    fs.writeFileSync("/sys/class/gpio/unexport", pin, "utf8");
            }
        }
    };

    // Status reporting code
    // Use this to report missing hardware, plugin or unsupported browser
    ext._getStatus = function ()
    {
        return {status: 2, msg: 'Ready'};
    };

    ext.set_gpio = function (pin, val) 
    {
        if (pin === '' || pin < 0 || pin > 27) return;

        var dir = 0, lev;
        if (val == 'output high') lev = 1;
        else if (val == 'output low') lev = 0;
        else dir = 1;

		// check the pin is exported
		if (!fs.existsSync("/sys/class/gpio/gpio" + pin)) 
			fs.writeFileSync("/sys/class/gpio/export", pin, "utf8");

		// the ownership of direction takes time to establish, so try this until it succeeds
		while (true)
		{
			try {
				fs.writeFileSync("/sys/class/gpio/gpio" + pin + "/direction", dir == 0 ? "out" : "in", "utf8");
				break;
			}
			catch (error) {
				continue;
			}
		}

		// set the output value
        if (dir == 0)
            fs.writeFileSync("/sys/class/gpio/gpio" + pin + "/value", lev == 1 ? "1" : "0", "utf8");
    };
  
    ext.get_gpio = function (pin) 
    {
        if (pin === '' || pin < 0 || pin > 27) return;

		// check the pin is exported
		if (!fs.existsSync("/sys/class/gpio/gpio" + pin)) 
			fs.writeFileSync("/sys/class/gpio/export", pin);

		// read the pin value
		var data = fs.readFileSync ("/sys/class/gpio/gpio" + pin + "/value", 'utf8');

		if (data.slice(0,1) == "1") return true;
		else return false;
    };
    
    ext.send_packet_cb = function (usb, cmd, p1, p2, p3, func)
    {
        var packet = new Buffer ([cmd,0,0,0,p1,0,0,0,p2,0,0,0,p3,0,0,0]);
        var s = new net.Socket();

        if (usb == 'local') addr = '127.0.0.1';
        else addr = 'fe80::1%' + usb;

        s.connect (8888, addr, function () {
            s.write (packet, function () {
                s.end ();
            });
        });

        s.on('data', function (data) {
            if (data[12] == 1) func (true);
            else func (false);
        });

        s.on('error', function (err) {
            func (false);
        });
    }

    ext.set_gpio_rem = function (usb, pin, val) 
    {
        if (pin === '' || pin < 0 || pin > 27) return;

        var dir = 1, lev;
        if (val == 'output high') lev = 1;
        else if (val == 'output low') lev = 0;
        else dir = 0;

        // set mode to input or output - command 0 = mode set
        ext.send_packet_cb (usb, 0, pin, dir, 0, function (data) { } );

        // if output, set level - command 4 = write
        if (dir == 1)
            ext.send_packet_cb (usb, 4, pin, lev, 0, function (data) { });
    };

    ext.get_gpio_rem = function (usb, pin, callback) 
    {
        if (pin === '' || pin < 0 || pin > 27)
        {
            callback (false);
            return;
        }

        // read pin value - command 3 = read
        ext.send_packet_cb (usb, 3, pin, 0, 0, callback);
    };

	ext.gpio_on_off = function (pin, val) 
    {
        if (pin === '' || pin < 0 || pin > 27) return;

        var lev;
        if (val == 'on') lev = 1;
        else lev = 0;

		// check the pin is exported
		if (!fs.existsSync("/sys/class/gpio/gpio" + pin)) 
			fs.writeFileSync("/sys/class/gpio/export", pin, "utf8");

		// the ownership of direction takes time to establish, so try this until it succeeds
		while (true)
		{
			try {
				fs.writeFileSync("/sys/class/gpio/gpio" + pin + "/direction", "out", "utf8");
				break;
			}
			catch (error) {
				continue;
			}
		}

		// set the output value
        fs.writeFileSync("/sys/class/gpio/gpio" + pin + "/value", lev == 1 ? "1" : "0", "utf8");
    };

    ext.gpio_toggle = function (pin) 
    {
        if (pin === '' || pin < 0 || pin > 27) return;

		// check the pin is exported
		if (!fs.existsSync("/sys/class/gpio/gpio" + pin)) 
			fs.writeFileSync("/sys/class/gpio/export", pin);

		// read the pin value
		var data = fs.readFileSync ("/sys/class/gpio/gpio" + pin + "/value", 'utf8');

		// the ownership of direction takes time to establish, so try this until it succeeds
		while (true)
		{
			try {
				fs.writeFileSync("/sys/class/gpio/gpio" + pin + "/direction", "out", "utf8");
				break;
			}
			catch (error) {
				continue;
			}
		}

		// set the output value
		if (data.slice(0,1) == "1") 
			fs.writeFileSync("/sys/class/gpio/gpio" + pin + "/value", "0", "utf8");
		else 
			fs.writeFileSync("/sys/class/gpio/gpio" + pin + "/value", "1", "utf8");
    };

	ext.when_pin_on_off = function (pin, val) 
    {
        if (pin === '' || pin < 0 || pin > 27) return;

		// check the pin is exported
		if (!fs.existsSync("/sys/class/gpio/gpio" + pin)) 
			fs.writeFileSync("/sys/class/gpio/export", pin);
			
		// the ownership of direction takes time to establish, so try this until it succeeds
		while (true)
		{
			try {
				fs.writeFileSync("/sys/class/gpio/gpio" + pin + "/direction", "in", "utf8");
				break;
			}
			catch (error) {
				continue;
			}
		}

		// read the pin value
		var data = fs.readFileSync ("/sys/class/gpio/gpio" + pin + "/value", 'utf8');

		if (data.slice(0,1) == "1" && val == 'on') return true;
		else if (data.slice(0,1) == "0" && val == 'off') return true;
		else return false;
		
    };

	ext.get_gpio_on_off = function (pin) 
    {
        if (pin === '' || pin < 0 || pin > 27) return;

		// check the pin is exported
		if (!fs.existsSync("/sys/class/gpio/gpio" + pin)) 
			fs.writeFileSync("/sys/class/gpio/export", pin);

		// read the pin value
		var data = fs.readFileSync ("/sys/class/gpio/gpio" + pin + "/value", 'utf8');

		if (data.slice(0,1) == "1") return 'on';
		else return 'off';
    };

    // Block and block menu descriptions
    var cpu = fs.readFileSync ("/proc/cpuinfo", 'utf8');
    if (cpu.indexOf ("ARM") != -1)
    {
        var descriptor = {
            blocks: [
				['h', 'when pin %m.gpios turns %m.on_off', 'when_pin_on_off', ''],
				[' ', 'turn pin %m.gpios %m.on_off', 'gpio_on_off', '', 'on'],
				[' ', 'toggle pin %m.gpios', 'gpio_toggle', '', 'on'],
				['r', 'pin %m.gpios', 'get_gpio_on_off', ''],
				['b', 'pin %m.gpios is on?', 'get_gpio', ''],
                
            ],
            menus: {
				on_off: ['on', 'off'],
                outputs: ['output high', 'output low', 'input'],
                gpios: ['0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27'],
            }
        };
    }
    else
    {
        var descriptor = {
            blocks: [
                [' ', 'set remote %m.usb gpio %m.gpios to %m.outputs', 'set_gpio_rem', 'usb0', '', 'output high'],
                ['B', 'remote %m.usb gpio %m.gpios is high?', 'get_gpio_rem', 'usb0', ''],
            ],
            menus: {
                outputs: ['output high', 'output low', 'input'],
                usb: ['usb0', 'usb1', 'usb2', 'usb3'],
                gpios: ['0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27'],
            }
        };    
    }

    // Register the extension
    ScratchExtensions.register('Pi GPIO', descriptor, ext);
})();
