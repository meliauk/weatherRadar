import { Router } from 'express';
import { Repository } from '../db/repository';

const router = Router();

// 获取所有分组
router.get('/groups', async (req, res) => {
  try {
    const groups = await Repository.getAllGroups();
    res.json(groups);
  } catch (error) {
    res.status(500).json({ message: '获取分组失败', error: (error as Error).message });
  }
});

// 创建分组
router.post('/groups', async (req, res) => {
  try {
    const { name } = req.body;
    const id = await Repository.createGroup(name);
    res.json({ id, name });
  } catch (error) {
    res.status(500).json({ message: '创建分组失败', error: (error as Error).message });
  }
});

// 获取所有配置（包含规则）
router.get('/configs', async (req, res) => {
  try {
    const configs = await Repository.getAllConfigs();
    
    // 获取每个配置的规则
    const configsWithRules = await Promise.all(configs.map(async (config) => {
      const rules = await Repository.getRulesByConfigId(config.id!);
      return { ...config, rules };
    }));
    
    res.json(configsWithRules);
  } catch (error) {
    res.status(500).json({ message: '获取配置失败', error: (error as Error).message });
  }
});

// 创建配置
router.post('/configs', async (req, res) => {
  try {
    const {
      groupName, cityName, reminderDays, advanceMinutes,
      rules, pushMethod, email, wechatWebhook, ntfyTopic, isActive
    } = req.body;

    const groupId = await Repository.getOrCreateGroup(groupName || '默认分组');

    // 创建配置
    const configId = await Repository.createConfig({
      group_id: groupId,
      city_name: cityName,
      reminder_days: reminderDays,
      advance_minutes: advanceMinutes || 60,
      push_method: pushMethod,
      email,
      wechat_webhook: wechatWebhook,
      ntfy_topic: ntfyTopic,
      is_active: isActive
    });

    // 创建规则
    if (rules && rules.length > 0) {
      for (const rule of rules) {
        await Repository.createRule({
          config_id: configId,
          weather_type: rule.weatherType,
          start_hour: rule.startHour || null,
          end_hour: rule.endHour || null,
          is_active: 1
        });
      }
    }

    res.json({ id: configId, message: '配置创建成功' });
  } catch (error) {
    res.status(500).json({ message: '创建配置失败', error: (error as Error).message });
  }
});

// 更新配置
router.put('/configs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      groupName, cityName, reminderDays, advanceMinutes,
      rules, pushMethod, email, wechatWebhook, ntfyTopic, isActive
    } = req.body;

    const groupId = groupName ? await Repository.getOrCreateGroup(groupName) : undefined;

    // 更新配置
    await Repository.updateConfig(parseInt(id), {
      group_id: groupId,
      city_name: cityName,
      reminder_days: reminderDays,
      advance_minutes: advanceMinutes,
      push_method: pushMethod,
      email,
      wechat_webhook: wechatWebhook,
      ntfy_topic: ntfyTopic,
      is_active: isActive
    });

    // 更新规则（先删除旧的，再创建新的）
    if (rules) {
      await Repository.deleteRulesByConfigId(parseInt(id));
      for (const rule of rules) {
        await Repository.createRule({
          config_id: parseInt(id),
          weather_type: rule.weatherType,
          start_hour: rule.startHour || null,
          end_hour: rule.endHour || null,
          is_active: 1
        });
      }
    }

    res.json({ message: '配置更新成功' });
  } catch (error) {
    res.status(500).json({ message: '更新配置失败', error: (error as Error).message });
  }
});

// 删除配置
router.delete('/configs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // 先删除关联的规则
    await Repository.deleteRulesByConfigId(parseInt(id));
    // 再删除配置
    await Repository.deleteConfig(parseInt(id));
    
    res.json({ message: '配置删除成功' });
  } catch (error) {
    res.status(500).json({ message: '删除配置失败', error: (error as Error).message });
  }
});

// 获取单个配置（包含规则）
router.get('/configs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const config = await Repository.getConfigById(parseInt(id));
    if (!config) {
      return res.status(404).json({ message: '配置不存在' });
    }
    
    const rules = await Repository.getRulesByConfigId(parseInt(id));
    res.json({ ...config, rules });
  } catch (error) {
    res.status(500).json({ message: '获取配置失败', error: (error as Error).message });
  }
});

// 触发天气分析（早晨4点执行的任务）
router.post('/analyze-weather', async (req, res) => {
  try {
    const { analyzeWeatherAndSchedule } = await import('../services/cron');
    await analyzeWeatherAndSchedule();
    res.json({ message: '天气分析已触发' });
  } catch (error) {
    res.status(500).json({ message: '分析失败', error: (error as Error).message });
  }
});

// 获取待发送任务
router.get('/pending-tasks', async (req, res) => {
  try {
    const tasks = await Repository.getUnsentTasks();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: '获取任务失败', error: (error as Error).message });
  }
});

export default router;
