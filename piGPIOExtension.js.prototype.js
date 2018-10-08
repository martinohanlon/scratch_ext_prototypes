
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

	ext._export_pin = function (pin)
	{
		// check the pin is exported
		if (!fs.existsSync("/sys/class/gpio/gpio" + pin)) 
			fs.writeFileSync("/sys/class/gpio/export", pin);
	}

	ext._set_pin_direction = function (pin, dir)
	{
		// the ownership of direction takes time to establish, so try this until it succeeds
		while (true)
		{
			try {
				fs.writeFileSync("/sys/class/gpio/gpio" + pin + "/direction", dir, "utf8");
				break;
			}
			catch (error) {
				continue;
			}
		}
    }
    
    ext._set_active_low = function (pin, val)
    {
        // set the value of active_low
        fs.writeFileSync("/sys/class/gpio/gpio" + pin + "/active_low", val, "utf8");
    }

	ext._get_pin_value = function (pin)
	{
		// read the pin value
		var data = fs.readFileSync ("/sys/class/gpio/gpio" + pin + "/value", 'utf8');

		return data.slice(0,1);
	}

	ext._set_pin_value = function (pin, lev)
	{
		// set the output value
        fs.writeFileSync("/sys/class/gpio/gpio" + pin + "/value", lev, "utf8");
	}

	ext.button_pressed_released = function (pin, val) 
    {
        if (pin === '' || pin < 0 || pin > 27) return;

		ext._export_pin(pin);

		ext._set_pin_direction(pin, "in");
		
		data = ext._get_pin_value(pin);

		if (data == "1" && val == 'pressed') return true;
		else if (data == "0" && val == 'released') return true;
		else return false;
		
	};
	
	ext.set_gpio_on_off = function (pin, val) 
    {
        if (pin === '' || pin < 0 || pin > 27) return;

		ext._export_pin(pin);

		ext._set_pin_direction(pin, "out");

		if (val == 'on') ext._set_pin_value(pin, "1");
        else ext._set_pin_value(pin, "0");

	};
	
	ext.gpio_toggle = function (pin) 
    {
        ext._export_pin(pin);

		// read the pin value
		 var data = ext._get_pin_value(pin);
		
		ext._set_pin_direction(pin, "out");

		// set the output value
		if (data == "1") ext._set_pin_value(pin, "0");
		else ext._set_pin_value(pin, "1");
    };

    ext.input_active_inactive = function (pin, val) 
    {
        if (pin === '' || pin < 0 || pin > 27) return;

		ext._export_pin(pin);

		ext._set_pin_direction(pin, "in");
		
		data = ext._get_pin_value(pin);

		if (data == "1" && val == 'active') return true;
		else if (data == "0" && val == 'inactive') return true;
		else return false;
		
    };

    // cant be done via fs!
    /*ext.set_gpio_pull_up_down = function (pin, pull_up_down)
    {
        if (pin === '' || pin < 0 || pin > 27) return;

		ext._export_pin(pin);

        ext._set_pin_direction(pin, "in");
        
        if (pull_up_down == "pull_up") return;
        else return;
    }*/
    
    ext.output_on_off = function (pin, val) 
    {
        if (pin === '' || pin < 0 || pin > 27) return;

		ext._export_pin(pin);

		data = ext._get_pin_value(pin);

		if (data == "1" && val == 'on') return true;
		else if (data == "0" && val == 'off') return true;
		else return false;
		
	};

    // Block and block menu descriptions
    var cpu = fs.readFileSync ("/proc/cpuinfo", 'utf8');
    if (cpu.indexOf ("ARM") != -1)
    {
        var descriptor = {
            blocks: [
				['h', 'when button %m.gpios is %m.pressed_released', 'button_pressed_released', '', 'pressed'],
				['b', 'button %m.gpios is %m.pressed_released?', 'button_pressed_released', '', 'pressed'],
				[' ', 'turn LED %m.gpios %m.on_off', 'set_gpio_on_off', '', 'on'],
				[' ', 'toggle LED %m.gpios', 'gpio_toggle', ''],
				['h', 'when input %m.gpios is %m.active_inactive', 'input_active_inactive', '', 'active'],
				['b', 'input %m.gpios is %m.active_inactive?', 'input_active_inactive', '', 'active'],
			    [' ', 'set input %m.gpios to %m.pull_up_down', 'set_gpio_pull_up_down', '', 'pull_down'],
				[' ', 'set output %m.gpios %m.on_off', 'set_gpio_on_off', '', 'on'],
				[' ', 'toggle output %m.gpios', 'gpio_toggle', ''],
				['b', 'output %m.gpios is %m.on_off?', 'output_on_off', '', 'on'],
                
            ],
            menus: {
                active_inactive: ['active', 'inactive'],
				pressed_released: ['pressed', 'released'],
				on_off: ['on', 'off'],
				pull_up_down: ['pull_up', 'pull_down'],
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
