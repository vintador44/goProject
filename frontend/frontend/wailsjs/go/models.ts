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

