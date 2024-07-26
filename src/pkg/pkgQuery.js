import { getModule } from './registry.js';

/**
 * @param {string} message
 */
function errorResponse(message) {
    // Normalize error messages, as NPM isn't consistent with its responses
    if (!message.startsWith('Error: ')) message = `Error: ${message}`;
    throw new Error(message);
}

export async function getPackageData(pkgQuery) {
    const pkgQueries = pkgQuery.toLowerCase().split(',');

    const moduleTrees = [];
    let uniqueModules = new Set();
    const stats = {
        moduleCount: 0,
        nodeCount: 0,
    }

    for (const query of pkgQueries) {
        try {
            if (!query) errorResponse('Missing package query');
            if (!/^(?:@.+\/[a-z]|[a-z])/.test(query))
                errorResponse(
                    'Invalid package query, see: https://docs.npmjs.com/cli/v10/configuring-npm/package-json#name',
                );

            const [entryModule, graph] = await walkModuleGraph(query);
            const [moduleTree, uModules, nodeCount] = formTreeFromGraph(graph.get(entryModule.key), graph);

            moduleTrees.push(moduleTree);
            stats.nodeCount += nodeCount;

            uniqueModules = new Set([...uniqueModules, ...uModules]);
        } catch (e) {
            errorResponse(e.message);
        }
    }

    stats.moduleCount = uniqueModules.size;
    return { moduleTrees, stats };
}

/**
 * @typedef {import('./types.d.ts').Module} Module
 * @typedef {import('./types.d.ts').ModuleInfo} ModuleInfo
 * @typedef {import('./types.d.ts').Graph} Graph
 */

/**
 * @param {string} query
 * @returns {Promise<[Module, Graph]>}
 */
async function walkModuleGraph(query) {
    /** @type {Graph} */
    const graph = new Map();

    /**
     * @param {Module} module
     * @param {number} [level=0]
     */
    const _walk = async (module, level = 0) => {
        if (!module) return Promise.reject(new Error('Module not found'));

        if (graph.has(module.key)) return;

        let deps = [];
        for (const [name, version] of Object.entries(module.pkg.dependencies || {})) {
            deps.push({ name, version });
        }

        /** @type {ModuleInfo} */
        const info = {
            module,
            level,
            dependencies: [],
        };
        graph.set(module.key, info);

        const resolvedDeps = await Promise.all(
            deps.map(async (dep) => {
                const module = await getModule(dep.name, dep.version);
                await _walk(module, level + 1);

                return module;
            }),
        );

        info.dependencies = resolvedDeps;
    };

    const module = await getModule(query);
    await _walk(module);
    return [module, graph];
}

/**
 * @param {ModuleInfo} entryModule
 * @param {Graph} graph
 * @returns {[Object, Set<string>, number]}
 */
function formTreeFromGraph(entryModule, graph) {
    let moduleTree = {};
    const parentNodes = new Set();

    const uniqueModules = new Set();
    let nodeCount = 0;

    /**
     * @param {ModuleInfo} module
     * @param {{ dependencies: unknown[] }} [parent]
     */
    const _walk = (module, parent) => {
        const shouldWalk = !parentNodes.has(module.module.pkg.name);

        const m = {
            name: module.module.pkg.name,
            version: module.module.pkg.version,
            ...(shouldWalk && module.dependencies.length && { dependencies: [] }),
        };
        uniqueModules.add(m.name);

        if (shouldWalk) {
            parentNodes.add(m.name);
            for (const dep of module.dependencies) {
                _walk(graph.get(dep.key), m);
            }
            parentNodes.delete(m.name);
        }

        parent ? parent.dependencies.push(m) : (moduleTree = m);
        nodeCount++;
    };

    if (entryModule) _walk(entryModule);
    return [moduleTree, uniqueModules, nodeCount];
}
