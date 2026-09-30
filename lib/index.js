/**
 * dsh-aionui-layout, node half.
 *
 * The plugin is pure browser layout work: the host half exists only so the
 * package can be a loader row. The client half ships as `./client` and is
 * discovered through the `dsh.client` declaration in package.json.
 */

/** Host plugin body — no host-side behavior for this layout plugin. */
function apply() {}

export { apply }
