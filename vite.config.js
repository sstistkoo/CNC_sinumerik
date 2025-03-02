export default {
    server: {
        port: 5173,
        watch: {
            usePolling: true
        }
    },
    base: './',
    assetsInclude: ['**/*.json'],
    resolve: {
        alias: {
            '@': '/src',
            '@components': '/src/components',
            '@styles': '/src/styles',
            '@js': '/src/js',
            '@data': '/data'
        }
    }
}
