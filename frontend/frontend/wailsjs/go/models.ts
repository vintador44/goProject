export namespace DataAdmin {
	
	export class ConnectionSettings {
	    Host: string;
	    Port: string;
	    User: string;
	    Password: string;
	    Dbname: string;
	    Sslmode: string;
	    Database: string;
	
	    static createFrom(source: any = {}) {
	        return new ConnectionSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Host = source["Host"];
	        this.Port = source["Port"];
	        this.User = source["User"];
	        this.Password = source["Password"];
	        this.Dbname = source["Dbname"];
	        this.Sslmode = source["Sslmode"];
	        this.Database = source["Database"];
	    }
	}

}

export namespace sysagent {
	
	export class Metrics {
	    hostname: string;
	    cpu_percent: number;
	    ram_percent: number;
	    gpu_percent: number;
	    cpu_model: string;
	    cpu_temp: string;
	    ram_total: number;
	    gpu_model: string;
	    gpu_temp: string;
	    disks: Record<string, any>;
	    net_interfaces: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new Metrics(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hostname = source["hostname"];
	        this.cpu_percent = source["cpu_percent"];
	        this.ram_percent = source["ram_percent"];
	        this.gpu_percent = source["gpu_percent"];
	        this.cpu_model = source["cpu_model"];
	        this.cpu_temp = source["cpu_temp"];
	        this.ram_total = source["ram_total"];
	        this.gpu_model = source["gpu_model"];
	        this.gpu_temp = source["gpu_temp"];
	        this.disks = source["disks"];
	        this.net_interfaces = source["net_interfaces"];
	    }
	}
	export class DeviceInfo {
	    ip: string;
	    metrics: Metrics;
	
	    static createFrom(source: any = {}) {
	        return new DeviceInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ip = source["ip"];
	        this.metrics = this.convertValues(source["metrics"], Metrics);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class History {
	    cpu: number[];
	    ram: number[];
	    gpu: number[];
	    time: number[];
	
	    static createFrom(source: any = {}) {
	        return new History(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cpu = source["cpu"];
	        this.ram = source["ram"];
	        this.gpu = source["gpu"];
	        this.time = source["time"];
	    }
	}

}

export namespace sysmon {
	
	export class CPUInfo {
	    Name: string;
	    Cores: number;
	    LoadPct: number;
	
	    static createFrom(source: any = {}) {
	        return new CPUInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.Cores = source["Cores"];
	        this.LoadPct = source["LoadPct"];
	    }
	}
	export class DiskInfo {
	    TotalGB: number;
	    FreeGB: number;
	    UsedPercent: number;
	
	    static createFrom(source: any = {}) {
	        return new DiskInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.TotalGB = source["TotalGB"];
	        this.FreeGB = source["FreeGB"];
	        this.UsedPercent = source["UsedPercent"];
	    }
	}
	export class GPUInfo {
	    Name: string;
	
	    static createFrom(source: any = {}) {
	        return new GPUInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	    }
	}
	export class NetworkAdapter {
	    Name: string;
	    MAC: string;
	    IP: string;
	    Status: string;
	
	    static createFrom(source: any = {}) {
	        return new NetworkAdapter(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Name = source["Name"];
	        this.MAC = source["MAC"];
	        this.IP = source["IP"];
	        this.Status = source["Status"];
	    }
	}
	export class NetworkInfo {
	    Adapters: NetworkAdapter[];
	    TotalCount: number;
	
	    static createFrom(source: any = {}) {
	        return new NetworkInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Adapters = this.convertValues(source["Adapters"], NetworkAdapter);
	        this.TotalCount = source["TotalCount"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RAMInfo {
	    TotalGB: number;
	    UsedGB: number;
	    Percent: number;
	
	    static createFrom(source: any = {}) {
	        return new RAMInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.TotalGB = source["TotalGB"];
	        this.UsedGB = source["UsedGB"];
	        this.Percent = source["Percent"];
	    }
	}

}

