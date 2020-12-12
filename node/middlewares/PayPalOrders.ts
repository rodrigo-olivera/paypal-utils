export async function listOrders(ctx: Context, next: () => Promise<any>) {
  const { clients: { paypal, status: statusClient }, } = ctx

  const date = new Date()
  const from = new Date(new Date().setHours(date.getHours() - 24)).toISOString()
  const to = new Date(new Date().setHours(date.getHours() - 2)).toISOString()

  console.log({ from, to })

  const params = {
    per_page: 100,
    orderBy: "creationDate,asc",
    f_paymentNames: "PayPal",
    incompleteOrders: true,
    f_creationDate: `creationDate:[${from} TO ${to}]`
  }

  const { list } = await paypal.listOrders(params, ctx.vtex.authToken)
  ctx.state.orderList = list

  const {
    headers,
  } = await statusClient.getStatusWithHeaders(200)

  ctx.status = 200
  ctx.set('Cache-Control', headers['cache-control'])

  await next()
}

export async function listOrdersDetail(ctx: Context, next: () => Promise<any>) {
  const {
    clients: { paypal, status: statusClient },
  } = ctx

  if (ctx.state.orderList?.length) {
    console.log('orderList', ctx.state.orderList?.length)
    ctx.state.ordersListDetail = await Promise.all(ctx.state.orderList.map(async ({ orderId }: any) => {
      const lol = await paypal.orderDetail(orderId, ctx.vtex.authToken)
      return lol
    }))
  }

  const {
    headers,
  } = await statusClient.getStatusWithHeaders(200)

  ctx.status = 200
  ctx.set('Cache-Control', headers['cache-control'])

  await next()
}

export async function paymentInteractions(ctx: Context, next: () => Promise<any>) {
  const {
    clients: { paypal, status: statusClient },
  } = ctx

  if (ctx.state.ordersListDetail?.length) {
    console.log('ordersListDetail', ctx.state.ordersListDetail?.length)

    const transactionsList: any[] = []
    ctx.state.ordersListDetail.map(({ orderId, status, value, paymentData: { transactions } }: any) =>
      transactions.map(({ transactionId }: any) => transactionsList.push({ orderId, status, value, transactionId })))

    const orders: any[] = await Promise.all(transactionsList.map(async ({ orderId, status, value, transactionId }) =>
      ({ orderId, status, value, interactions: await paypal.paymentInteractions(transactionId, ctx.vtex.authToken) })))

    const i: any[] = []
    orders.forEach((order) => {
      const l = order.interactions.find(({ Message }: any) => Message.includes('Usuario precisa ter se autenticado no Paypal para prosseguir com a transação.'))
      const o = order.interactions.find(({ Message }: any) => Message.includes('Transaction cancelation has finished for Id'))
      if (!o && l) i.push(order)
    })

    ctx.state.interactions = i.map(({ orderId, status, value, interactions }) => (
      {
        orderId,
        status,
        value,
        interaction: interactions.find(({ Message }: any) =>
          Message === 'Usuario precisa ter se autenticado no Paypal para prosseguir com a transação.')
      }
    )).filter(({ interaction }) => {
      return interaction != null;
    });
  }

  const {
    headers,
  } = await statusClient.getStatusWithHeaders(200)

  ctx.status = 200
  ctx.set('Cache-Control', headers['cache-control'])

  await next()
}

export async function cancelTransaction(ctx: Context, next: () => Promise<any>) {
  const {
    clients: { gateway, status: statusClient },
  } = ctx

  if (ctx.state.interactions?.length) {
    console.log('interactions', ctx.state.interactions?.length)

    if (ctx.request.query.cancel) {
      const cancelation: any[] = await Promise.all(ctx.state.interactions.map(async ({ interaction: { TransactionId }, value, orderId }: any) =>
        ({ orderId, TransactionId, value, cancelation: await gateway.cancelTransactions(TransactionId, value) })))
      ctx.body = cancelation
    } else {
      ctx.body = ctx.state.interactions
    }
  }

  const {
    headers,
  } = await statusClient.getStatusWithHeaders(200)

  ctx.status = 200
  ctx.set('Cache-Control', headers['cache-control'])

  await next()
}