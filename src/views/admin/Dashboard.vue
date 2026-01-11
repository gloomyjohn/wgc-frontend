<template>
  <div class="admin-dashboard">
    <el-row :gutter="20" style="height: 100vh;">
      
      <el-col :span="9" class="left-panel">
        <el-card class="box-card">
          <template #header>
            <div class="card-header column">
              <div class="header-title">{{ $t('dashboard.title') }}</div>

              <div class="header-controls">
                <el-input v-model="searchQuery" size="small" :placeholder="$t('dashboard.search.placeholder')" clearable style="width:160px"></el-input>
                <el-button type="primary" size="small" @click="fetchDriverList">{{ $t('dashboard.refreshList') }}</el-button>
                <el-select v-model="locale" size="small" @change="onLanguageChange" placeholder="Lang" style="width:110px">
                  <el-option label="中文" value="zh"></el-option>
                  <el-option label="English" value="en"></el-option>
                </el-select>
                <el-tag type="success" size="small">{{ $t('dashboard.autoRefresh') }}</el-tag>
              </div>
            </div>
          </template>
          
          <el-table :data="filteredDrivers" style="width: 100%" height="calc(100vh - 150px)">
            <el-table-column prop="id" :label="$t('dashboard.table.id')" width="80" />
            <el-table-column prop="status" :label="$t('dashboard.table.status')" width="120">
              <template #default="scope">
                <el-tag :type="scope.row.status === 'ONLINE' ? 'success' : 'info'">
                  {{ scope.row.status === 'ONLINE' ? $t('dashboard.status.online') : $t('dashboard.status.offline') }}
                </el-tag>
              </template>
            </el-table-column>
            
            <el-table-column :label="$t('dashboard.table.actions')" min-width="180">
              <template #default="scope">
                <el-button-group>
                  <el-button 
                    size="small" 
                    type="primary" 
                    plain
                    @click="focusOnDriver(scope.row)">
                    {{ $t('dashboard.actions.track') }}
                  </el-button>
                  
                  <el-button 
                    size="small" 
                    type="warning" 
                    plain
                    v-if="scope.row.targetLat"
                    @click="toggleTarget(scope.row)">
                    {{ isTargetVisible(scope.row.id) ? $t('dashboard.actions.hideTarget') : $t('dashboard.actions.showTarget') }}
                  </el-button>
                </el-button-group>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="15" style="height: 100%; padding: 0;">
        <div id="admin-map"></div>
        <div class="map-overlay">
          <p><strong>{{ $t('dashboard.map.title') }}</strong></p>
          <p>{{ $t('dashboard.map.onlineDrivers') }}: <span style="color: green; font-weight: bold;">{{ onlineCount }}</span></p>
          <p>{{ $t('dashboard.map.lastUpdate') }}: {{ lastUpdateTime }}</p>
        </div>
      </el-col>

    </el-row>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import L from 'leaflet'
// 引入 Element Plus 的弹窗组件
import { ElMessageBox, ElMessage } from 'element-plus'

const { t, locale } = useI18n()

// 搜索 / 过滤支持（按司机 ID）
const searchQuery = ref('')
const isFetching = ref(false)
const filteredDrivers = computed(() => {
  if (!searchQuery.value) return driverList.value
  const q = String(searchQuery.value).trim()
  return driverList.value.filter(d => String(d.id).includes(q))
})

// 汽车图标（Admin 地图用）
const carDivIcon = L.divIcon({
  className: 'admin-car-icon',
  html: `<div class="car-marker">🚗</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -12]
})

let autoRefreshTimer = null
const AUTO_REFRESH_MS = 3000

// 将选择的语言持久化到 localStorage
const onLanguageChange = (val) => {
  if (val) localStorage.setItem('locale', val)
}
watch(locale, (val) => {
  if (val) localStorage.setItem('locale', val)
})

// --- 数据定义 ---
const driverList = ref([])
const lastUpdateTime = ref('')
const map = ref(null)
const markers = {} // 存储当前位置标记 { driverId: Marker }
const targetLayers = {} // 存储目标位置相关的图层 (线和点) { driverId: LayerGroup }

const onlineCount = computed(() => driverList.value.filter(d => d.status === 'ONLINE').length)

// --- 1. 初始化地图 (新加坡中心) ---
const initMap = () => {
  // 🔥 改动点：坐标换成了新加坡 (1.3521, 103.8198)
  map.value = L.map('admin-map').setView([1.3521, 103.8198], 12)

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: 'Map data &copy; OpenStreetMap contributors'
  }).addTo(map.value)
}

// --- 2. 获取司机列表（从后端 API 获取） ---
import api from '@/services/api'

const fetchDriverList = async () => {
  if (isFetching.value) return
  isFetching.value = true
  try {
    const res = await api.get('/v1/driverStatusLocations/list')

    // 后端返回的数据可能在 res.data 或 res.data.data 中
    let list = []
    if (res && Array.isArray(res.data)) {
      list = res.data
    } else if (res && res.data && Array.isArray(res.data.data)) {
      list = res.data.data
    } else if (res && res.data && Array.isArray(res.data.results)) {
      list = res.data.results
    } else {
      // 如果无法解析，尝试保守读取为空
      list = []
    }

    // 映射为页面所需字段
    driverList.value = list.map(item => ({
      id: String(item.driverId),
      status: item.status,
      lat: (item.latitude !== undefined && item.latitude !== null) ? Number(item.latitude) : null,
      lon: (item.longitude !== undefined && item.longitude !== null) ? Number(item.longitude) : null,
      targetLat: (item.target_latitude !== undefined && item.target_latitude !== null) ? Number(item.target_latitude) : null,
      targetLon: (item.target_longitude !== undefined && item.target_longitude !== null) ? Number(item.target_longitude) : null,
      lastUpdated: item.last_updated_at
    }))

    updateMapMarkers()
    lastUpdateTime.value = new Date().toLocaleTimeString()
  } catch (error) {
    console.error("获取列表失败", error)
    ElMessage.error({ message: t('dashboard.messages.fetchFailed') })
  } finally {
    isFetching.value = false
  }
}

// --- 3. 更新地图上的司机点 ---
const updateMapMarkers = () => {
  if (!map.value) return

  driverList.value.forEach(driver => {
    // 即使是离线司机，如果想在地图上保留最后位置，也可以画，只是换个颜色
    // 这里我们逻辑保持：只自动刷新“在线”的点
    if (driver.status === 'ONLINE' && driver.lat && driver.lon) {
      if (markers[driver.id]) {
        markers[driver.id].setLatLng([driver.lat, driver.lon])
      } else {
        const marker = L.marker([driver.lat, driver.lon], { icon: carDivIcon }).bindPopup(t('dashboard.popups.driverId', { id: driver.id })).addTo(map.value)
        markers[driver.id] = marker
      }
      
      // 如果开启了目标显示，连线也要跟着动
      if (targetLayers[driver.id]) {
        refreshTargetLayer(driver)
      }
    } else {
      // 离线司机暂不自动移除，为了方便追踪最后位置，但可以变灰 (可选优化)
      // if (markers[driver.id]) map.value.removeLayer(markers[driver.id])
    }
  })
}

// --- 4. 🔥 追踪功能 (含离线提示) ---
const focusOnDriver = (driver) => {
  if (!driver.lat || !driver.lon) {
    ElMessage.warning({ message: t('dashboard.messages.noLocation') })
    return
  }

  const doFocus = () => {
    map.value.setView([driver.lat, driver.lon], 15) // 放大
    // 如果地图上没有这个点（比如之前被移除了），临时画一个灰色的
    if (!markers[driver.id]) {
      const marker = L.circleMarker([driver.lat, driver.lon], {
        color: 'gray', // 灰色代表离线
        radius: 8
      }).bindPopup(t('dashboard.popups.offlineDriverId', { id: driver.id })).addTo(map.value)
      markers[driver.id] = marker
    }
    markers[driver.id].openPopup()
  }

  // 🔥 核心改动：离线判断
  if (driver.status === 'OFFLINE' || driver.status === '离线') {
    ElMessageBox.confirm(
      t('dashboard.messages.offlineConfirmMessage'),
      t('dashboard.messages.offlineConfirmTitle'),
      {
        confirmButtonText: t('dashboard.messages.offlineConfirmConfirm'),
        cancelButtonText: t('dashboard.messages.offlineConfirmCancel'),
        type: 'warning',
      }
    ).then(() => {
      doFocus() // 用户点确定，执行追踪
    }).catch(() => {
      // 用户点取消，啥也不做
    })
  } else {
    // 在线，直接追踪
    doFocus()
  }
}

// --- 5. 🔥 显示/隐藏目标地点 ---
const isTargetVisible = (id) => !!targetLayers[id]

const toggleTarget = (driver) => {
  const id = driver.id
  
  // 如果已经显示了，就移除（隐藏）
  if (targetLayers[id]) {
    map.value.removeLayer(targetLayers[id])
    delete targetLayers[id]
    return
  }

  // 如果没显示，就开始画
  drawTarget(driver)
}

const drawTarget = (driver) => {
  if (!driver.targetLat || !driver.targetLon) return

  // 创建一个 LayerGroup 把线和点打包
  const layerGroup = L.layerGroup()

  // 1. 画目标点 (红色图标)
  const targetMarker = L.marker([driver.targetLat, driver.targetLon], {
    icon: L.divIcon({
      className: 'custom-div-icon',
      html: "<div style='background-color:red;width:10px;height:10px;border-radius:50%;border:2px solid white;'></div>",
      iconSize: [14, 14]
    })
  }).bindPopup(t('dashboard.messages.targetPopup', { lat: driver.targetLat, lon: driver.targetLon }))
  
  // 2. 画虚线 (连接当前位置 -> 目标)
  const line = L.polyline(
    [[driver.lat, driver.lon], [driver.targetLat, driver.targetLon]], 
    { color: 'red', dashArray: '5, 10', weight: 2 }
  )

  layerGroup.addLayer(targetMarker)
  layerGroup.addLayer(line)
  
  // 添加到地图并保存引用
  layerGroup.addTo(map.value)
  targetLayers[driver.id] = layerGroup
  
  // 自动缩放地图以囊括起点和终点
  map.value.fitBounds(line.getBounds(), { padding: [50, 50] })
}

// 辅助：刷新连线 (当司机移动时，线也要跟着动)
const refreshTargetLayer = (driver) => {
  // 先移除旧的，再画新的 (简单粗暴)
  if (targetLayers[driver.id]) {
    map.value.removeLayer(targetLayers[driver.id])
    drawTarget(driver)
  }
}

onMounted(() => {
  initMap()
  fetchDriverList()
  // 自动刷新以便查看司机实时移动
  autoRefreshTimer = setInterval(fetchDriverList, AUTO_REFRESH_MS)
})

onUnmounted(() => {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer)
})
</script>

<style scoped>
.left-panel {
  padding: 10px;
  background-color: #f5f7fa;
  height: 100vh;
}

#admin-map {
  width: 100%;
  height: 100vh;
}

.map-overlay {
  position: absolute;
  top: 20px;
  right: 20px;
  background: rgba(255, 255, 255, 0.95);
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  font-size: 14px;
  line-height: 1.5;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 当需要标题独占一行并把控件放到下一行右侧 */
.card-header.column {
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.header-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
  width: 100%;
}

/* 小车图标样式（Leaflet DOM） */
::v-deep .car-marker {
  font-size: 14px;
  line-height: 28px;
  text-align: center;
  background: linear-gradient(180deg, #90caf9, #42a5f5);
  border-radius: 50%;
  width: 28px;
  height: 28px;
  border: 2px solid rgba(255,255,255,0.7);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
  display: inline-block;
  transform: translate(-50%, -50%);
  pointer-events: auto;
}
</style>