import api from './api'

// 更新司机位置（后端应负责将位置广播到 RabbitMQ/订阅系统）
export const updateLocation = (payload) => {
  return api.post(`/v1/drivers/location/update`, payload)
}

// 更新司机状态（上线/下线）
export const updateStatus = (driver) => {

  return api.post(`/v1/drivers/update`,  driver )
}

// 请求乘客（获取随机乘客坐标）
export const requestPassenger = (payload) => {
  return api.post('/v1/drivers/requestPassenger', payload)
}

export default {
  updateLocation,
  updateStatus,
  requestPassenger,
}
