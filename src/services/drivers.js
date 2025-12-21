import api from './api'

// 更新司机位置（后端应负责将位置广播到 RabbitMQ/订阅系统）
export const updateLocation = (driverId, payload) => {
  return api.post(`/api/drivers/${driverId}/location`, payload)
}

// 更新司机状态（上线/下线）
export const updateStatus = (driver) => {

  return api.post(`/v1/drivers/update`,  driver )
}
// {
//     "driverId": 0,
//     "currentStatus": "string",
//     "onboardedAt": "2019-08-24T14:15:22.123Z",
//     "vehicleInfo": {
//         "property1": {},
//         "property2": {}
//     },
//     "createdAt": "2019-08-24T14:15:22.123Z",
//     "updatedAt": "2019-08-24T14:15:22.123Z"
// }

export default {
  updateLocation,
  updateStatus,
}
