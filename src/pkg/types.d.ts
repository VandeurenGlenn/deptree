// index
export interface Module {
    key: string;
    pkg: PackageData;
    maintainers: Maintainers[];
}

export interface ModuleInfo {
    module: Module;
    level: number;
    dependencies: Module[];
}

type Graph = Map<string, ModuleInfo>;

// registry
export interface PackageData {
    name: string;
    version: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    maintainers?: { name: string; email: string }[];
}

export interface Maintainers {
    name: string;
    email: string;
}

export interface ModuleCacheEntry {
    resolve: Promise<Module>;
    module: Module;
}

export interface PackageMetaData {
    'dist-tags'?: Record<string, string>;
    versions: Record<string, PackageData>;
    maintainers: Maintainers[];
    error?: string;
}
