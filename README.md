# PlayCanvas Kinematic Character Controller

A high-performance, physics-based character controller for PlayCanvas that provides smooth movement, jumping, slope handling, and moving platform support.

![./media/demo.mp4](./media/demo.mp4)

### Demo: [https://playcanv.as/b/c2e720c5](https://playcanv.as/b/c2e720c5)
### Project: [https://playcanvas.com/editor/scene/2283593](https://playcanvas.com/editor/scene/2283593)


## Features

- **Slope Handling**: Automatic slope detection and sliding on steep surfaces
- **Moving Platforms**: Full support for moving and rotating platforms
- **Collision Detection**: Robust collision handling with walls, corners, and ceilings
- **Ground Snapping**: Automatic ground detection when falling
- **Air Control**: Configurable air movement control
- **Input Agnostic**: Provide your own input logic. Keyboard control example included
- **Jumping**: Configurable jump speed with optional continuous jumping
- **Stairs**: Hover height allow for adjusting max climbable stair
- **Debug Visualization**: Optional debug rendering for collision detection

## Installation

### Prerequisites

- **Important**: Use the included `ammo.js` files instead of PlayCanvas's built-in version, as the PlayCanvas version is outdated and may cause compatibility issues.
- **Shape Casting**: The controller requires `convex-cast.js` as PlayCanvas does not natively include shape casting functionality at the time of writing.

### Setup

1. Copy the `kcc/` folder to your PlayCanvas project
2. Copy the `Ammo/` folder to your project (contains the required ammo.js files)
3. Add the scripts to your character entity:
   - `kcc.mjs` - Main controller script
   - `kccInputDesktop.mjs` - Desktop input handling

### Controls

- **WASD**: Movement
- **Mouse**: Look around (yaw rotation)
- **Space**: Jump
- **Shift**: Sprint (increases speed by `sprintScalar`)

## Configuration

### KCC Script Attributes

| Attribute | Default | Description |
|-----------|---------|-------------|
| `speed` | 6 | Walk speed in m/s |
| `gravity` | -9.81 | Gravity acceleration in m/s² |
| `jumpSpeed` | 6 | Initial jump velocity in m/s |
| `airControl` | 1 | Air movement control (0-1) |
| `radius` | 0.5 | Controller collision radius in meters |
| `maxIterations` | 5 | Maximum collision resolution iterations |
| `slopeLimitDeg` | 50 | Maximum walkable slope angle in degrees |
| `skin` | 0.01 | Collision skin thickness in meters |
| `groundSnap` | 0.3 | Ground snapping distance in meters |
| `hover` | 0.2 | Hover distance above ground when grounded |
| `debug` | false | Enable debug visualization |

### KccInputDesktop Script Attributes

| Attribute | Default | Description |
|-----------|---------|-------------|
| `lookSpeed` | 0.5 | Mouse look sensitivity |
| `sprintScalar` | 2.0 | Speed multiplier when sprinting |
| `continuousJump` | false | Enable continuous jumping while holding space |

## Technical Details

### Architecture

The controller uses a two-pass collision resolution system with the collide & slide algorithm:

1. **Vertical Pass**: Handles gravity, jumping, and ground detection
2. **Horizontal Pass**: Handles player movement and wall collisions

### Performance

- Optimized collision detection with configurable iteration limits
- Efficient vector math operations
- Minimal memory allocation during runtime



### Custom Input Integration

```javascript
// Access the controller from your input script
const kcc = entity.script.kcc;

// Set input manually
kcc.setInput(horizontal, vertical, jump, yawDelta);
```

## Troubleshooting

### Common Issues

1. **Character falls through ground**: Increase `groundSnap` value or check collision layers
2. **Stuck on slopes**: Adjust `slopeLimitDeg` or `skin` values
3. **Poor performance**: Reduce `maxIterations` or disable debug visualization
4. **Physics errors**: Ensure you're using the included ammo.js files, not PlayCanvas's built-in version

### Debug Mode

Enable the `debug` attribute to visualize:
- Controller collision sphere
- Grounded state (blue = grounded, red = not grounded)
- Collision raycasts
- Hit points and normals

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve the controller.
