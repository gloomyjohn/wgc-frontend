<template>
    <div class="simulator-container">
        <!-- 地图容器（Leaflet 会渲染到这里） -->
        <div id="map"></div>

        <el-card class="control-panel">
            <template #header>
                <!-- 标题与在线状态 -->
                <div class="card-header">
                    <span>{{ $t('simulator.title') }}</span>
                    <el-tag type="success" v-if="isOnline">{{ $t('simulator.online') }}</el-tag>
                    <el-tag type="info" v-else>{{ $t('simulator.offline') }}</el-tag>
                </div>
            </template>

            <div class="controls">
                <el-form label-width="70px">
                    <el-form-item :label="$t('simulator.driverId')">
                        <el-input v-model="driverId" placeholder="10001" />
                    </el-form-item>

                    <el-form-item :label="$t('simulator.currentLocation')">
                        <span style="font-size: 12px; color: #666">
                            {{ currentLat.toFixed(4) }}, {{ currentLon.toFixed(4) }}
                        </span>
                    </el-form-item>

                    <!-- 乘客位置：显示坐标、距离以及添加/移除/居中按钮 -->
                    <el-form-item :label="$t('simulator.passengerLocation')">
                        <div style="display:flex;align-items:center;justify-content:space-between">
                            <div>
                                <div style="font-size:12px;color:#666">{{ passengerLat ? passengerLat.toFixed(4) : '-'
                                    }}, {{
                                        passengerLon ? passengerLon.toFixed(4) : '-' }}</div>
                                <div style="font-size:12px;color:#666">{{ $t('simulator.distance') }}: {{
                                    passengerDistance ?
                                        passengerDistance + ' m' : '-' }}</div>
                            </div>

                            <div style="display:flex;flex-direction:column;gap:8px">
                                <el-button type="info" size="mini" @click="addRandomPassenger">{{
                                    $t('simulator.addPassenger')
                                    }}</el-button>
                                <el-button type="danger" size="mini" :disabled="!passengerMarker"
                                    @click="removePassenger">{{
                                        $t('simulator.removePassenger') }}</el-button>
                                <el-button type="primary" size="mini" :disabled="!passengerMarker"
                                    @click="centerPassenger">{{
                                        $t('simulator.centerPassenger') }}</el-button>
                            </div>
                        </div>
                    </el-form-item>

                    <!-- 切换中英文（选择语言将被持久化到 localStorage） -->
                    <el-form-item :label="$t('simulator.language')">
                        <el-select v-model="locale" placeholder="Lang" size="mini" @change="onLanguageChange">
                            <el-option label="中文" value="zh"></el-option>
                            <el-option label="English" value="en"></el-option>
                        </el-select>
                    </el-form-item>



                    <div style="display:flex;flex-direction:column;gap:8px">
                        <!-- 操作按钮：上线/下线、开始/停止、重置、居中 -->
                        <div class="buttons">
                            <el-button type="primary" @click="toggleOnline" :type="isOnline ? 'danger' : 'primary'">
                                {{ isOnline ? $t('simulator.goOffline') : $t('simulator.goOnline') }}
                            </el-button>

                            <el-button type="success" :disabled="!isOnline" @click="startSimulation">
                                ▶️ {{ $t('simulator.start') }}
                            </el-button>

                            <el-button type="warning" :disabled="!isOnline" @click="stopSimulation">
                                ⏸️ {{ $t('simulator.stop') }}
                            </el-button>

                            <el-button type="info" @click="resetSimulation">
                                🔄 {{ $t('simulator.reset') }}
                            </el-button>

                            <el-button type="primary" @click="centerMap">
                                📍 {{ $t('simulator.center') }}
                            </el-button>
                        </div>

                        <!-- 显示/隐藏其他竞争司机 -->
                        <div style="display:flex;justify-content:space-between;align-items:center">
                            <div style="font-size:12px;color:#666">{{ $t('simulator.otherDriversVisible') }}</div>
                            <el-switch v-model="showOtherDrivers" :active-text="$t('simulator.show')"
                                :inactive-text="$t('simulator.hide')" @change="onToggleOtherDrivers" />
                        </div>
                        <!-- 按路网驱动：控制其他司机是否按真实路网行驶（使用 OSRM） -->
                        <el-form-item>
                            <el-switch v-model="otherDriversFollowRoads" :active-text="$t('simulator.followRoads')" />
                        </el-form-item>
                    </div>
                </el-form>
            </div>
        </el-card>
    </div>
</template>

<script setup>
// Simulator 页面 — 司机模拟驾驶舱
// 说明：该页面负责模拟司机上线、行程、乘客与竞争司机，使用 Leaflet 渲染地图，
// axios 上报位置到后端，vue-i18n 提供中英文切换
import { onMounted, ref, computed, watch } from 'vue'
import { DatetimeFormat, useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import L from 'leaflet'
// 引入 axios 准备对接后端
import axios from 'axios'
import drivers, { updateStatus } from '@/services/drivers'

// --- 状态数据 ---
const driverId = ref('10001')
const isOnline = ref(false)
// 新加坡中心坐标 (WGS84)
const initialLat = 1.3521
const initialLon = 103.8198
const currentLat = ref(initialLat)
const currentLon = ref(initialLon)
let map = null // 地图实例
let driverMarker = null // 司机的小图标 (Marker)
let simulationTimer = null // 模拟移动的定时器
let pathPolyline = null // 行程轨迹线
let pathCoords = [] // 记录的坐标数组

// 乘客（目标）相关
let passengerMarker = null
const passengerLat = ref(null)
const passengerLon = ref(null)
let passengerLine = null

// 监听语言变更（将选择持久化）
const { locale } = useI18n()
const onLanguageChange = (val) => {
    if (val) localStorage.setItem('locale', val)
}
watch(locale, (val) => {
    if (val) localStorage.setItem('locale', val)
})

// 其他竞争司机（随机移动或路网驱动）
const showOtherDrivers = ref(true)
const numOtherDrivers = 3
let otherDrivers = [] // {id, lat, lon, marker, polyline, coords, timer, route, routeIdx, routeTimer}
// 是否使用路网驱动（默认启用）
const otherDriversFollowRoads = ref(false)
// 路由服务（使用 OSRM demo 公共端点，受限于可用性与速率限制）
const ROUTING_BASE = 'https://router.project-osrm.org'



const passengerDistance = computed(() => {
    if (!passengerLat.value || !passengerLon.value) return null
    if (map && map.distance) {
        try {
            return Math.round(map.distance([currentLat.value, currentLon.value], [passengerLat.value, passengerLon.value]))
        } catch (e) {
            // fallback to haversine
        }
    }
    // haversine fallback
    const toRad = d => d * Math.PI / 180
    const R = 6371000
    const dLat = toRad(passengerLat.value - currentLat.value)
    const dLon = toRad(passengerLon.value - currentLon.value)
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(currentLat.value)) * Math.cos(toRad(passengerLat.value)) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return Math.round(R * c)
})

// --- 初始化地图 ---
const initMap = () => {
    // 如果已经存在地图实例，先移除（避免重复初始化）
    if (map) {
        map.remove()
        map = null
    }

    // 1. 创建地图，中心点设在新加坡
    map = L.map('map', { zoomControl: true }).setView([initialLat, initialLon], 13)

    // 2. 加载图层 (使用 OpenStreetMap，免费)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)

    // 添加比例尺
    L.control.scale().addTo(map)

    // 3. 使用自定义的出租车图标（emoji + 圆形风格）
    const driverDivIcon = L.divIcon({
        className: 'driver-div-icon',
        html: `<div class="taxi-marker">🚕</div>`,
        // 固定像素大小，保证在任意缩放级别都同样大小
        iconSize: [46, 46],
        iconAnchor: [23, 23],
        popupAnchor: [0, -28]
    })

    driverMarker = L.marker([currentLat.value, currentLon.value], { icon: driverDivIcon }).addTo(map)
    driverMarker.bindPopup(`司机: ${driverId.value}`)

    // 初始化轨迹线
    pathCoords = [[currentLat.value, currentLon.value]]
    // 我的司机颜色为蓝色，竞争司机使用红色
    pathPolyline = L.polyline(pathCoords, { color: '#409eff', weight: 4, opacity: 0.85 }).addTo(map)

    // 如需显示其他司机，初始化他们
    if (showOtherDrivers.value) {
        initOtherDrivers()
    }
}

// --- 上班/下班 ---
const toggleOnline = () => {
    isOnline.value = !isOnline.value
    if (isOnline.value) {
        // 上线时，通知一下后端
        console.log(`司机 ${driverId.value} 上线了`)
        var driver = {
            driverId: (driverId.value)-0,
            currentStatus: 'IDLE',
            onboardedAt: new Date().toISOString(),
            createdAt: "2019-08-24T14:15:22.123Z",
            updatedAt: new Date().toISOString()
        }
        drivers.updateStatus(driver)
        .then(res => {
            if (res && res.data.code == 200) {
                ElMessage.success({ message: res.data.data })
            } else {
                ElMessage.error({ message: res.data.data })
            }
        })
        .catch(err => {
            console.warn('更新司机状态失败:', err)
            ElMessage.error({ message: '更新司机状态失败' })
        });

    }
    else {
        // 下线时，清除定时器
        stopSimulation()
        console.log(`司机 ${driverId.value} 下线了`)
        var driver = {
            driverId: (driverId.value)-0,
            currentStatus: 'OFFLINED',
            onboardedAt: new Date().toISOString(),
            createdAt: "2019-08-24T14:15:22.123Z",
            updatedAt: new Date().toISOString()
        }
        drivers.updateStatus(driver)
        .then(res => {
            if (res && res.data.code == 200) {
                ElMessage.success({ message: res.data.data })
            } else {
                ElMessage.error({ message: res.data.data })
            }
        })
        .catch(err => {
            console.warn('更新司机状态失败:', err)
            ElMessage.error({ message: '更新司机状态失败' })
        });
    }
}

// --- 模拟行程 (核心逻辑) ---
const startSimulation = () => {
    if (simulationTimer) return; // 防止重复点击

    console.log("开始模拟行程...")

    // 模拟一条向右上角移动的路线
    simulationTimer = setInterval(() => {
        // 1. 改变坐标 (模拟移动)
        currentLat.value += 0.0005
        currentLon.value += 0.0005

        // 2. 更新地图上的点和轨迹
        if (driverMarker) {
            driverMarker.setLatLng([currentLat.value, currentLon.value])
            // 平滑移动并居中显示
            map.panTo([currentLat.value, currentLon.value], { animate: true, duration: 0.5 })
        }

        // 可选：如果你希望减少上报频率，可以改为批量或节流上报（示例：每 3 次上报一次）
        // 更新其他司机与自己的相对显示（可扩展）
        // 目前其他司机独立移动，不需要特别同步，但可以在此处添加碰撞或优先级逻辑

        // 3. 🔥 调用你的后端 API (上报位置)
        reportLocationToBackend()

        // 也可以异步不阻塞主流程（根据需求决定是否等待）
        drivers.updateLocation(driverId.value, { lat: currentLat.value, lon: currentLon.value }).catch(err => {
            console.warn('drivers.updateLocation failed (silent):', err)
        })
    })
}

// 停止模拟并清理定时器
const stopSimulation = () => {
    if (simulationTimer) {
        clearInterval(simulationTimer)
        simulationTimer = null
        console.log("模拟停止")
    }
}

// 重置模拟：回到起点并清除轨迹
// 恢复初始位置并清理/重建其他司机
const resetSimulation = () => {
    stopSimulation()
    currentLat.value = initialLat
    currentLon.value = initialLon
    pathCoords = [[currentLat.value, currentLon.value]]
    if (pathPolyline) {
        pathPolyline.setLatLngs(pathCoords)
    }
    if (driverMarker) {
        driverMarker.setLatLng([currentLat.value, currentLon.value])
    }
    if (map) {
        map.setView([currentLat.value, currentLon.value], 13)
    }

    // 重置其他司机（如果可见则重新初始化）
    removeOtherDrivers()
    if (showOtherDrivers.value) initOtherDrivers()

    console.log("已重置模拟位置")
}

// 将地图居中到当前司机位置
const centerMap = () => {
    if (map) {
        map.panTo([currentLat.value, currentLon.value], { animate: true, duration: 0.5 })
    }
}

// ===== 乘客（目标）功能 =====
// 添加乘客标记到地图并绘制司机->乘客连线（用于模拟接单/目标点）
const addPassengerAt = (lat, lon) => {
    if (!map) return
    // 移除已有乘客
    if (passengerMarker) removePassenger()

    const passengerIcon = L.divIcon({
        className: 'passenger-div-icon',
        html: `<div class="passenger-marker">🎯</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    })

    passengerMarker = L.marker([lat, lon], { icon: passengerIcon }).addTo(map)
    passengerLat.value = lat
    passengerLon.value = lon

    // 绘制司机到乘客的连线
    passengerLine = L.polyline([[currentLat.value, currentLon.value], [lat, lon]], { color: '#409eff', weight: 3, opacity: 0.9, dashArray: '6,6' }).addTo(map)
}

const addRandomPassenger = () => {
    // 随机放在司机附近 +/- ~1km 范围内
    const offsetLat = (Math.random() - 0.5) * 0.02
    const offsetLon = (Math.random() - 0.5) * 0.02
    addPassengerAt(currentLat.value + offsetLat, currentLon.value + offsetLon)
}

const removePassenger = () => {
    if (passengerMarker) {
        passengerMarker.remove()
        passengerMarker = null
    }
    if (passengerLine) {
        passengerLine.remove()
        passengerLine = null
    }
    passengerLat.value = null
    passengerLon.value = null
}

const centerPassenger = () => {
    if (passengerLat.value && passengerLon.value && map) {
        map.panTo([passengerLat.value, passengerLon.value], { animate: true })
    }
}

const updatePassengerLine = () => {
    if (passengerLine && passengerLat.value && passengerLon.value) {
        passengerLine.setLatLngs([[currentLat.value, currentLon.value], [passengerLat.value, passengerLon.value]])
    }
}

// ===== 其他竞争司机的逻辑 =====
// 创建并添加一名竞争司机（marker + polyline），并启动其移动逻辑
const addOtherDriver = (lat, lon, idx) => {
    if (!map) return
    const id = `other-${idx}`
    const icon = L.divIcon({ className: 'other-div-icon', html: `<div class="other-marker">🚗</div>`, iconSize: [36, 36], iconAnchor: [18, 18] })
    const marker = L.marker([lat, lon], { icon }).addTo(map)
    const coords = [[lat, lon]]
    const polyline = L.polyline(coords, { color: '#ff4d4f', weight: 3, opacity: 0.9 }).addTo(map)
    const drv = { id, lat, lon, marker, polyline, coords, timer: null, route: null, routeIdx: 0, routeTimer: null }
    otherDrivers.push(drv)

    // 根据配置选择路网驱动或随机驱动
    if (otherDriversFollowRoads.value) {
        planRouteForDriver(drv)
    } else {
        startOtherDriverMovement(drv)
    }
}

const stopOtherDriverMovement = (drv) => {
    if (drv.timer) {
        clearInterval(drv.timer)
        drv.timer = null
    }
    if (drv.routeTimer) {
        clearInterval(drv.routeTimer)
        drv.routeTimer = null
    }
}

// 路由获取：调用 OSRM API，返回 [[lat, lon], ...] 或 null（若请求失败返回 null）
const getRoute = async (fromLat, fromLon, toLat, toLon) => {
    try {
        const url = `${ROUTING_BASE}/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`
        const res = await fetch(url)
        if (!res.ok) return null
        const data = await res.json()
        if (!data.routes || !data.routes[0] || !data.routes[0].geometry) return null
        const coords = data.routes[0].geometry.coordinates // [ [lon,lat], ... ]
        // 转换为 [lat, lon]
        return coords.map(c => [c[1], c[0]])
    } catch (e) {
        console.warn('route fetch failed', e)
        return null
    }
}

const pickRandomDestinationNear = (lat, lon, radiusDeg = 0.03) => {
    return [lat + (Math.random() - 0.5) * radiusDeg, lon + (Math.random() - 0.5) * radiusDeg]
}

// 旧的随机移动备用（用于路由不可用时）
const startRandomMovement = (drv) => {
    if (drv.timer) return
    drv.timer = setInterval(() => {
        drv.lat += (Math.random() - 0.5) * 0.0016
        drv.lon += (Math.random() - 0.5) * 0.0016
        drv.marker.setLatLng([drv.lat, drv.lon])
        drv.coords.push([drv.lat, drv.lon])
        drv.polyline.setLatLngs(drv.coords)
    }, 900 + Math.random() * 900)
}

// 根据配置决定竞争司机使用路网驱动或随机移动
const startOtherDriverMovement = (drv) => {
    // 如果配置允许且地图可用，先尝试路网路径
    if (otherDriversFollowRoads.value) {
        planRouteForDriver(drv)
    } else {
        startRandomMovement(drv)
    }
}

// 为司机规划路由并沿路行驶
// 为竞争司机规划一条路网路线并按该路线行驶，失败则回退到随机行走
const planRouteForDriver = async (drv) => {
    // pick a random destination
    const [dLat, dLon] = pickRandomDestinationNear(drv.lat, drv.lon, 0.04)
    const route = await getRoute(drv.lat, drv.lon, dLat, dLon)
    if (route && route.length > 1) {
        drv.route = route
        drv.routeIdx = 0
        drv.routeTimer = setInterval(() => driveAlongRoute(drv), 600)
    } else {
        // 路由获取失败，退回到随机移动
        startOtherDriverMovement(drv)
    }
}

// 让竞争司机沿已规划的路线逐点前进
const driveAlongRoute = (drv) => {
    if (!drv.route || drv.routeIdx >= drv.route.length) {
        // 到达目的地，重新规划下一段
        if (drv.routeTimer) {
            clearInterval(drv.routeTimer)
            drv.routeTimer = null
        }
        planRouteForDriver(drv)
        return
    }
    const [lat, lon] = drv.route[drv.routeIdx]
    drv.lat = lat
    drv.lon = lon
    drv.marker.setLatLng([lat, lon])
    drv.coords.push([lat, lon])
    drv.polyline.setLatLngs(drv.coords)
    drv.routeIdx += 1
}

// 初始化若干竞争司机并放置在司机附近（用于场景展示）
const initOtherDrivers = () => {
    removeOtherDrivers()
    for (let i = 0; i < numOtherDrivers; i++) {
        const offsetLat = (Math.random() - 0.5) * 0.03
        const offsetLon = (Math.random() - 0.5) * 0.03
        addOtherDriver(currentLat.value + offsetLat, currentLon.value + offsetLon, i + 1)
    }
}

// 停止并移除所有竞争司机与其轨迹
const removeOtherDrivers = () => {
    otherDrivers.forEach(d => {
        stopOtherDriverMovement(d)
        if (d.marker) d.marker.remove()
        if (d.polyline) d.polyline.remove()
    })
    otherDrivers = []
}

// 响应开关：显示或隐藏其他司机
const onToggleOtherDrivers = (val) => {
    if (val) initOtherDrivers()
    else removeOtherDrivers()
}

// --- 对接后端 (RabbitMQ/Redis) ---
const reportLocationToBackend = async () => {
    try {
        const url = `http://localhost:8080/api/drivers/${driverId.value}/location`
        const payload = {
            lat: currentLat.value,
            lon: currentLon.value
        }

        // 发送请求
        await axios.post(url, payload)
        console.log(`位置上报成功: ${payload.lat}, ${payload.lon}`)

    } catch (error) {
        console.error("位置上报失败:", error)
    }
}

// 页面加载完成后，初始化地图
onMounted(() => {
    initMap()
})
</script>

<style scoped>
/* 样式部分 */
.simulator-container {
    position: relative;
    width: 100vw;
    height: 100vh;
    /* 全屏 */
    background: #f7f7f7;
}

#map {
    width: 100%;
    height: 100%;
    z-index: 1;
    /* 地图在最底层 */
}

/* 悬浮面板样式 */
.control-panel {
    position: absolute;
    top: 20px;
    right: 20px;
    width: 320px;
    z-index: 999;
    /* 在地图上面 */
    opacity: 0.98;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    overflow: visible;
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: bold;
}

/* 小状态点 */
.status-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 8px;
}

.status-online {
    background: #67c23a;
}

.status-offline {
    background: #909399;
}

.buttons {
    display: flex;
    gap: 8px;
    margin-top: 14px;
    flex-wrap: wrap;
}

/* 自定义出租车图标 (DivIcon) — 使用 ::v-deep 以确保作用于 Leaflet 渲染的 DOM（全局） */
::v-deep .driver-div-icon .taxi-marker {
    font-size: 20px;
    line-height: 46px;
    text-align: center;
    background: linear-gradient(180deg, #ffd54f, #ffb300);
    border-radius: 50%;
    width: 46px;
    height: 46px;
    border: 2px solid rgba(0, 0, 0, 0.14);
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.2);
    display: inline-block;
    transform: translate(-50%, -50%);
    pointer-events: auto;
}

/* 乘客图标样式 */
::v-deep .passenger-div-icon .passenger-marker {
    font-size: 18px;
    line-height: 40px;
    text-align: center;
    background: linear-gradient(180deg, #90caf9, #42a5f5);
    border-radius: 50%;
    width: 40px;
    height: 40px;
    border: 2px solid rgba(0, 0, 0, 0.08);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
    display: inline-block;
    transform: translate(-50%, -50%);
}

/* 其他司机样式（红色） */
::v-deep .other-div-icon .other-marker {
    font-size: 16px;
    line-height: 36px;
    text-align: center;
    background: linear-gradient(180deg, #ff9e9e, #ff4d4f);
    border-radius: 50%;
    width: 36px;
    height: 36px;
    border: 2px solid rgba(0, 0, 0, 0.08);
    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.16);
    display: inline-block;
    transform: translate(-50%, -50%);
}


/* 更好的按钮间距 (Element Plus) */
.el-button {
    padding: 6px 10px;
    font-size: 13px;
}
</style>